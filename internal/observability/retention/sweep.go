// Package retention enforces ADR-028's time retention on the debug-capture tables.
package retention

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const (
	// RecorderSpan is how long the recorder keeps every capture and event in full.
	RecorderSpan = 2 * time.Hour
	// LedgerSpan is how long anything is kept at all: ledger classes, incidents, rollups and versions.
	LedgerSpan = 90 * 24 * time.Hour
	// KeepFirst is how many of a fingerprint's earliest incidents survive the trim.
	KeepFirst = 3
	// KeepLatest is how many of a fingerprint's latest incidents survive the trim.
	KeepLatest = 3
	// SweepInterval is the production cadence of RunLoop.
	SweepInterval = 5 * time.Minute
	// StartupMarker is the tracer-bullet message logged once per start; it is the one tracer step
	// that is not noise.
	StartupMarker = "tracer bullet ready"
)

// ErrNoDatabase reports a sweep asked to run without a database.
var ErrNoDatabase = errors.New("retention sweep: no database")

// SweepResult counts the rows one Sweep deleted per table.
type SweepResult struct {
	Captures  int64
	Events    int64
	Rollups   int64
	Versions  int64
	Incidents int64
}

// The ledger classes (ADR-028 D3, design L15 D-b) are retention classes of the recorder rows,
// expressed once here as SQL predicates over the row's own columns.
const (
	// JournalCapture selects state-changing requests: a write verb, or a reconcile that applied
	// operations to an anime.
	JournalCapture = `(kind IN ('post', 'put', 'patch', 'delete')
		OR (kind = 'reconcile' AND correlation_json LIKE '%"anime_id"%'))`
	// WebSocketCapture selects the WebSocket ledger: every ws_* capture.
	WebSocketCapture = `kind LIKE 'ws\_%' ESCAPE '\'`
	// NoiseEvent selects runtime events that repeat on every poll: reconcile events and tracer
	// steps other than the startup marker. Every other event belongs to the event ledger.
	NoiseEvent = `(COALESCE(event_type, '') = 'sync.reconcile'
		OR (COALESCE(event_type, '') = 'tracer.step' AND message <> '` + StartupMarker + `'))`
)

// pinnedBy returns the predicate selecting a row whose timestamp column lies inside the window
// of an incident that occurred within the ledger span (bound as the second argument).
func pinnedBy(column string) string {
	return `EXISTS (SELECT 1 FROM incidents
		WHERE incidents.window_start_ms <= ` + column + ` AND incidents.window_end_ms >= ` + column + `
		AND incidents.occurred_at_ms >= ?)`
}

// sweepStep is one bounded DELETE of the sweep and the result counter it feeds.
type sweepStep struct {
	name    string
	query   string
	args    func(recorderCutoff, ledgerCutoff int64) []any
	counter func(*SweepResult) *int64
}

// recorderArgs binds the recorder cutoff and the ledger cutoff that bounds live incidents.
func recorderArgs(recorderCutoff, ledgerCutoff int64) []any {
	return []any{recorderCutoff, ledgerCutoff}
}

// ledgerArgs binds the ledger cutoff alone.
func ledgerArgs(_, ledgerCutoff int64) []any { return []any{ledgerCutoff} }

// trimArgs binds the per-fingerprint keep counts.
func trimArgs(_, _ int64) []any { return []any{KeepFirst, KeepLatest} }

// sweepSteps are run in order: the recorder rules (a, b), the ledger horizon (c), then the
// incident trim (d).
var sweepSteps = []sweepStep{
	{
		name: "recorder captures",
		query: `DELETE FROM request_captures WHERE captured_at_ms < ?
			AND NOT ` + JournalCapture + ` AND NOT ` + WebSocketCapture + `
			AND NOT ` + pinnedBy("request_captures.captured_at_ms"),
		args:    recorderArgs,
		counter: func(r *SweepResult) *int64 { return &r.Captures },
	},
	{
		name: "recorder events",
		query: `DELETE FROM runtime_events WHERE occurred_at_ms < ?
			AND ` + NoiseEvent + `
			AND NOT ` + pinnedBy("runtime_events.occurred_at_ms"),
		args:    recorderArgs,
		counter: func(r *SweepResult) *int64 { return &r.Events },
	},
	{
		name:    "ledger captures",
		query:   `DELETE FROM request_captures WHERE captured_at_ms < ?`,
		args:    ledgerArgs,
		counter: func(r *SweepResult) *int64 { return &r.Captures },
	},
	{
		name:    "ledger events",
		query:   `DELETE FROM runtime_events WHERE occurred_at_ms < ?`,
		args:    ledgerArgs,
		counter: func(r *SweepResult) *int64 { return &r.Events },
	},
	{
		name:    "ledger rollups",
		query:   `DELETE FROM request_rollup_hourly WHERE hour_ms < ?`,
		args:    ledgerArgs,
		counter: func(r *SweepResult) *int64 { return &r.Rollups },
	},
	{
		name:    "ledger versions",
		query:   `DELETE FROM response_versions WHERE last_seen_ms < ?`,
		args:    ledgerArgs,
		counter: func(r *SweepResult) *int64 { return &r.Versions },
	},
	{
		name:    "ledger incidents",
		query:   `DELETE FROM incidents WHERE occurred_at_ms < ?`,
		args:    ledgerArgs,
		counter: func(r *SweepResult) *int64 { return &r.Incidents },
	},
	{
		name: "incident trim",
		query: `DELETE FROM incidents WHERE id IN (
			SELECT id FROM (
				SELECT id,
					ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY occurred_at_ms ASC, id ASC) AS first_rank,
					ROW_NUMBER() OVER (PARTITION BY fingerprint ORDER BY occurred_at_ms DESC, id DESC) AS latest_rank
				FROM incidents
			) WHERE first_rank > ? AND latest_rank > ?)`,
		args:    trimArgs,
		counter: func(r *SweepResult) *int64 { return &r.Incidents },
	},
}

// Sweep deletes what retention no longer keeps at now. Each step is its own statement, so a
// step that fails leaves the earlier steps' deletions in place and the next pass retries it.
func Sweep(ctx context.Context, db *sql.DB, now time.Time) (SweepResult, error) {
	var result SweepResult
	if db == nil {
		return result, ErrNoDatabase
	}
	recorderCutoff := now.Add(-RecorderSpan).UnixMilli()
	ledgerCutoff := now.Add(-LedgerSpan).UnixMilli()
	for _, step := range sweepSteps {
		outcome, err := db.ExecContext(ctx, step.query, step.args(recorderCutoff, ledgerCutoff)...)
		if err != nil {
			return result, fmt.Errorf("%s: %w", step.name, err)
		}
		deleted, err := outcome.RowsAffected()
		if err != nil {
			return result, fmt.Errorf("%s: %w", step.name, err)
		}
		*step.counter(&result) += deleted
	}
	return result, nil
}

// RunLoop sweeps every interval until ctx is cancelled. A failed pass is reported through logf
// and retried on the next tick. The caller runs the start-up sweep itself.
func RunLoop(ctx context.Context, db *sql.DB, interval time.Duration, logf func(string, ...any)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := Sweep(ctx, db, time.Now()); err != nil && ctx.Err() == nil {
				logf("retention sweep: %v", err)
			}
		}
	}
}
