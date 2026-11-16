// Package dbstall keeps the evidence of a held bridge.db connection
// (docs/architecture/contexts/observability/overview.md, Stall evidence).
//
// The Bridge reaches bridge.db through one connection. When something keeps it,
// every handler and every runtime_events write waits behind it, so the evidence
// cannot go to the database: it goes to a file, written once by the hung
// process, and is imported as one Activity event by the next start. Files rotate
// like Ollama's logs: db-stall.log is the stall not yet imported, and
// db-stall-1.log to db-stall-5.log are the imported ones, newest first.
package dbstall

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const (
	// PendingFile holds the stall not yet imported.
	PendingFile = "db-stall.log"
	// MaxRotated is how many imported stalls are kept besides the pending one.
	MaxRotated = 5
)

// PoolStats is the connection pool as the hung process saw it.
type PoolStats struct {
	MaxOpen        int   `json:"maxOpen"`
	InUse          int   `json:"inUse"`
	Idle           int   `json:"idle"`
	WaitCount      int64 `json:"waitCount"`
	WaitDurationMS int64 `json:"waitDurationMs"`
}

// PoolStatsFrom keeps the pool facts a stall needs.
func PoolStatsFrom(stats sql.DBStats) PoolStats {
	return PoolStats{
		MaxOpen: stats.MaxOpenConnections, InUse: stats.InUse, Idle: stats.Idle,
		WaitCount: stats.WaitCount, WaitDurationMS: stats.WaitDuration.Milliseconds(),
	}
}

// Header is the first line of an evidence file: which stall, when, which
// abandoned request found it, and the pool at that moment.
type Header struct {
	ID           string    `json:"id"`
	OccurredAtMS int64     `json:"occurredAtMs"`
	Route        string    `json:"route"`
	Pool         PoolStats `json:"pool"`
}

// Pending is the stall a previous process recorded and no start has imported.
type Pending struct {
	Header Header
	Dump   []byte
}

// Write records one stall as the pending file: the header line, then the
// goroutine dump. A pending file already there is rotated first, so it is kept
// as an older one even though no start imported it.
func Write(dir string, header Header, dump []byte) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := Rotate(dir); err != nil {
		return err
	}
	line, err := json.Marshal(header)
	if err != nil {
		return err
	}
	content := append(append(line, '\n'), dump...)
	return os.WriteFile(filepath.Join(dir, PendingFile), content, 0o600)
}

// ReadPending reads the pending file. ok is false when there is none. A file
// whose header cannot be read is still pending, with an error: the caller
// rotates it so it is not read again on every start.
func ReadPending(dir string) (pending Pending, ok bool, err error) {
	content, err := os.ReadFile(filepath.Join(dir, PendingFile))
	if errors.Is(err, os.ErrNotExist) {
		return Pending{}, false, nil
	}
	if err != nil {
		return Pending{}, true, err
	}
	line, dump, _ := bytes.Cut(content, []byte{'\n'})
	var header Header
	if err := json.Unmarshal(line, &header); err != nil {
		return Pending{}, true, fmt.Errorf("unreadable stall header in %s: %w", PendingFile, err)
	}
	if header.ID == "" {
		return Pending{}, true, fmt.Errorf("stall header in %s has no id", PendingFile)
	}
	return Pending{Header: header, Dump: dump}, true, nil
}

// Rotate shifts the chain: db-stall-5.log is dropped, each older file moves up
// one, and the pending file becomes db-stall-1.log. With no pending file it
// changes nothing.
func Rotate(dir string) error {
	pending := filepath.Join(dir, PendingFile)
	if _, err := os.Stat(pending); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err := os.Remove(rotatedPath(dir, MaxRotated)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for i := MaxRotated - 1; i >= 1; i-- {
		if err := os.Rename(rotatedPath(dir, i), rotatedPath(dir, i+1)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return os.Rename(pending, rotatedPath(dir, 1))
}

// rotatedPath is the path of the n-th older evidence file.
func rotatedPath(dir string, n int) string {
	return filepath.Join(dir, fmt.Sprintf("db-stall-%d.log", n))
}
