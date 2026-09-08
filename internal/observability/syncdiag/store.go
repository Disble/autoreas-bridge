package syncdiag

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"
)

const insertReportSQL = `
	INSERT INTO device_sync_diagnostics (
		device_id, reported_at_ms, cycle_id, degraded, trigger_source, app_state,
		consecutive_unclosed_cycles, pending_ops_count, cursor, recent_events_json,
		previous_cycle_id, previous_trigger_source, previous_outcome, previous_last_stage,
		previous_started_at, previous_elapsed_ms, previous_error_name,
		previous_native_errcode_byte, previous_error_stage, previous_error_cause,
		previous_error_fingerprint
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(cycle_id) DO NOTHING`

// Store persists validated diagnostics reports into bridge SQLite's
// device_sync_diagnostics table.
type Store struct {
	db          *sql.DB
	writeBudget time.Duration
	successful  int
}

// NewStore builds a SQLite-backed diagnostics store.
func NewStore(db *sql.DB, config StoreConfig) *Store {
	budget := config.WriteBudget
	if budget <= 0 {
		budget = WriteBudget
	}
	return &Store{db: db, writeBudget: budget}
}

// InsertReport stores one validated diagnostics record. A duplicate
// cycle_id is a no-op that still reports Duplicate, not an error -- this is
// what lets a caller retry blind and remain correct. The deadline bounds
// only this database call, never the caller's response: database/sql's
// connection-pool wait is context-aware, so a shed write gives up its place
// in the wait queue rather than landing its row after this call returns.
func (s *Store) InsertReport(ctx context.Context, record Record) (IngestOutcome, error) {
	if s.db == nil {
		return Shed, errors.New("syncdiag: store unavailable")
	}

	recentEventsJSON, err := marshalRecentEvents(record.RecentEvents)
	if err != nil {
		return Shed, err
	}

	writeCtx, cancel := context.WithTimeout(ctx, s.writeBudget)
	defer cancel()

	res, err := s.db.ExecContext(writeCtx, insertReportSQL, bindArgsFromRecord(record, recentEventsJSON)...)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return Shed, fmt.Errorf("%w: %w", ErrWriteBudget, err)
		}
		return Shed, err
	}

	inserted, _ := res.RowsAffected()
	if inserted != 1 {
		return Duplicate, nil
	}
	if pruneErr := s.pruneOldestBeyondRetention(ctx); pruneErr != nil {
		log.Printf("syncdiag: prune failed: %v", pruneErr)
	}
	return Stored, nil
}

// pruneOldestBeyondRetention deletes the oldest rows past retentionLimit,
// called every pruneEvery successful write so pruning cost scales with
// traffic rather than wall-clock time. The write counter is per-process and
// starts at zero, so cadence alone would never prune in a session that
// persists fewer than pruneEvery reports -- the common case for a desktop
// app with short sessions. The first write of every process therefore
// prunes unconditionally, which bounds the table at startup regardless of
// how short the preceding sessions were. A conflict no-op never reaches
// this method, so it never advances the counter.
func (s *Store) pruneOldestBeyondRetention(ctx context.Context) error {
	s.successful++
	if s.successful > 1 && s.successful%pruneEvery != 0 {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM device_sync_diagnostics
		WHERE rowid IN (
			SELECT rowid FROM device_sync_diagnostics
			ORDER BY reported_at_ms DESC
			LIMIT -1 OFFSET ?
		)
	`, retentionLimit)
	return err
}

// marshalRecentEvents re-serializes events into the recent_events_json
// column shape, storing '[]' for an empty or nil slice rather than the
// json.Marshal(nil) result "null".
func marshalRecentEvents(events []RecentEvent) ([]byte, error) {
	if len(events) == 0 {
		return []byte("[]"), nil
	}
	data, err := json.Marshal(events)
	if err != nil {
		return nil, fmt.Errorf("marshal recent events: %w", err)
	}
	return data, nil
}

// bindArgsFromRecord builds the positional bind args for insertReportSQL,
// matching its column order exactly. A nil PreviousCycle binds all 11
// previous_* columns to SQL NULL.
func bindArgsFromRecord(record Record, recentEventsJSON []byte) []any {
	args := []any{
		record.DeviceID, record.ReportedAtMS, record.CycleID, record.Degraded,
		record.TriggerSource, record.AppState, record.ConsecutiveUnclosedCycles,
		record.PendingOpsCount, record.Cursor, string(recentEventsJSON),
	}
	pc := record.PreviousCycle
	if pc == nil {
		return append(args, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	}
	outcome := pc.Outcome
	return append(args,
		pc.CycleID, pc.TriggerSource, &outcome, pc.LastStage,
		pc.StartedAt, pc.ElapsedMS, pc.ErrorName, pc.NativeErrcodeByte,
		pc.ErrorStage, pc.ErrorCause, pc.ErrorFingerprint,
	)
}
