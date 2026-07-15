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

type SnapshotParser interface {
	Parse(r io.Reader) (map[string]SnapshotRecord, []ParseWarning, error)
}

type streamingSnapshotParser struct{}

type tombstoneEnvelope struct {
	ID      string `json:"_id"`
	Deleted bool   `json:"$$deleted"`
}

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

		if lineNumber == 1 {
			line = bytes.TrimPrefix(line, []byte{0xEF, 0xBB, 0xBF})
		}

		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			record, warning, ok := parseSnapshotLine(line)
			if !ok {
				warnings = append(warnings, ParseWarning{Line: lineNumber, Reason: warning})
			} else if record.Hash == "" && record.CanonicalJSON == nil {
				delete(records, record.AnimeID)
			} else {
				records[record.AnimeID] = record
			}
		}

		if err == io.EOF {
			break
		}
	}

	return records, warnings, nil
}

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
