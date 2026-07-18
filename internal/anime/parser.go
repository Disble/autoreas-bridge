package anime

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"autoreas-bridge/internal/anime/legacy"
)

const parserBufferSize = 128 * 1024

// SnapshotParser reads an append-only legacy file into effective snapshot records.
type SnapshotParser interface {
	Parse(r io.Reader) (map[string]SnapshotRecord, []ParseWarning, error)
}

type streamingSnapshotParser struct{}

type tombstoneEnvelope struct {
	ID      string `json:"_id"`
	Deleted bool   `json:"$$deleted"`
}

// NewSnapshotParser builds the streaming snapshot parser used by runtime pipelines.
func NewSnapshotParser() SnapshotParser {
	return streamingSnapshotParser{}
}

func (streamingSnapshotParser) Parse(r io.Reader) (map[string]SnapshotRecord, []ParseWarning, error) {
	reader := bufio.NewReaderSize(r, parserBufferSize)
	records := make(map[string]SnapshotRecord)
	warnings := make([]ParseWarning, 0)

	for lineNumber := 1; ; lineNumber++ {
		line, err := reader.ReadBytes('\n')
		if err != nil && err != io.EOF {
			return nil, nil, fmt.Errorf("read snapshot line %d: %w", lineNumber, err)
		}
		warnings = processSnapshotLine(records, warnings, line, lineNumber)

		if err == io.EOF {
			break
		}
	}

	return records, warnings, nil
}

// processSnapshotLine parses one snapshot line and records any warning.
func processSnapshotLine(records map[string]SnapshotRecord, warnings []ParseWarning, line []byte, lineNumber int) []ParseWarning {
	if lineNumber == 1 {
		line = bytes.TrimPrefix(line, []byte{0xEF, 0xBB, 0xBF})
	}
	line = bytes.TrimSpace(line)
	if len(line) == 0 {
		return warnings
	}
	record, warning, ok := parseSnapshotLine(line)
	if !ok {
		return append(warnings, ParseWarning{Line: lineNumber, Reason: warning})
	}
	if record.Hash == "" && record.CanonicalJSON == nil {
		delete(records, record.AnimeID)
		return warnings
	}
	records[record.AnimeID] = record
	return warnings
}

// parseSnapshotLine decodes one snapshot line and returns its identifier.
func parseSnapshotLine(line []byte) (SnapshotRecord, string, bool) {
	var envelope tombstoneEnvelope
	if err := json.Unmarshal(line, &envelope); err != nil {
		return SnapshotRecord{}, fmt.Sprintf("decode line: %v", err), false
	}

	if envelope.ID == "" {
		return SnapshotRecord{}, "decode line: missing _id", false
	}

	if envelope.Deleted {
		return SnapshotRecord{AnimeID: envelope.ID}, "", true
	}

	value, canonicalJSON, err := legacy.Decode(line)
	if err != nil {
		return SnapshotRecord{}, fmt.Sprintf("decode line: %v", err), false
	}

	return SnapshotRecord{
		AnimeID:       value.ID,
		CanonicalJSON: canonicalJSON,
		Hash:          HashSnapshot(canonicalJSON),
	}, "", true
}
