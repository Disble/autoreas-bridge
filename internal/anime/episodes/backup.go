package episodes

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"autoreas-bridge/internal/persistence"
)

// errUnknownSource rejects a backup record whose source is neither
// SourceMeasured nor SourceManual.
var errUnknownSource = errors.New("backup: episode duration record has an unknown source")

// durationRecord is the JSONL wire shape of one episode_durations backup
// line. Field names match the column names: this is the bundle's contract.
type durationRecord struct {
	AnimeID     string `json:"anime_id"`
	Episode     int    `json:"episode"`
	DurationMS  int64  `json:"duration_ms"`
	Source      string `json:"source"`
	UpdatedAtMS int64  `json:"updated_at_ms"`
}

const insertDurationBackupSQL = `
	INSERT INTO anime_episode_durations (anime_id, episode, duration_ms, source, updated_at_ms)
	VALUES (?, ?, ?, ?, ?)`

// ExportEpisodeDurations returns a backup export function that streams every
// stored duration as one JSONL line, ordered by (anime_id, episode) for a
// reproducible bundle. The announcement queue is never exported.
func ExportEpisodeDurations(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		rows, err := db.QueryContext(ctx, selectDurationColumns+` ORDER BY anime_id, episode`)
		if err != nil {
			return 0, fmt.Errorf("query episode durations for export: %w", err)
		}
		durations, err := scanDurations(rows)
		if err != nil {
			return 0, err
		}
		enc := json.NewEncoder(w)
		for i, d := range durations {
			if err := enc.Encode(durationRecord(d)); err != nil {
				return i, fmt.Errorf("encode episode duration for export: %w", err)
			}
		}
		return len(durations), nil
	}
}

// ValidateEpisodeDurations returns a backup validate function that decodes
// every record and checks the invariants the schema enforces, touching no
// database.
func ValidateEpisodeDurations() func(context.Context, io.Reader) (int, error) {
	return func(_ context.Context, r io.Reader) (int, error) {
		return decodeRecords(r, validateRecord)
	}
}

// ImportEpisodeDurations returns a backup import function that replaces every
// stored duration with the stream's records in one transaction (a full
// refresh, like anime_snapshots). Pending announcement marks are left as
// they are. Every statement runs on tx: the bridge DB has one connection.
// On a failed record the count of records applied before it is returned
// with the error, and nothing is kept.
func ImportEpisodeDurations(db *sql.DB) func(context.Context, io.Reader) (int, error) {
	return func(ctx context.Context, r io.Reader) (int, error) {
		count := 0
		err := persistence.InTx(ctx, db, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, `DELETE FROM anime_episode_durations`); err != nil {
				return fmt.Errorf("delete episode durations for full refresh: %w", err)
			}
			var err error
			count, err = decodeRecords(r, func(rec durationRecord) error {
				_, execErr := tx.ExecContext(ctx, insertDurationBackupSQL,
					rec.AnimeID, rec.Episode, rec.DurationMS, rec.Source, rec.UpdatedAtMS)
				return execErr
			})
			return err
		})
		if err != nil {
			return count, fmt.Errorf("import episode durations: %w", err)
		}
		return count, nil
	}
}

// decodeRecords decodes JSONL records from r one at a time, passing each to
// apply, and returns how many it applied.
func decodeRecords(r io.Reader, apply func(durationRecord) error) (int, error) {
	dec := json.NewDecoder(r)
	count := 0
	for {
		var rec durationRecord
		if err := dec.Decode(&rec); err != nil {
			if errors.Is(err, io.EOF) {
				return count, nil
			}
			return count, fmt.Errorf("decode record %d: %w", count, err)
		}
		if err := apply(rec); err != nil {
			return count, fmt.Errorf("record %d: %w", count, err)
		}
		count++
	}
}

// validateRecord checks one record against the table's invariants.
func validateRecord(rec durationRecord) error {
	if err := validateTarget(rec.AnimeID, rec.Episode); err != nil {
		return err
	}
	if rec.DurationMS <= 0 {
		return fmt.Errorf("%w: got %d", ErrInvalidDuration, rec.DurationMS)
	}
	if rec.Source != SourceMeasured && rec.Source != SourceManual {
		return fmt.Errorf("%w: %q", errUnknownSource, rec.Source)
	}
	return nil
}
