package requestcapture

import (
	"context"
	"database/sql"
)

// SweepOrphanedCaptures closes every capture row still stuck in its
// transport-only arrival shape (outcome 'pending'), marking it OutcomeAbandoned.
//
// The capture middleware writes two rows per request under one request_id: a
// pending arrival before the handler runs, then a terminal row from a defer.
// When the process dies between them -- force close, crash, or a shutdown that
// tore down the capture queue and its SQLite fallback before the defer ran --
// the arrival row survives as 'pending' forever. Nothing else ever revisits it,
// so the Activity view reads it back on every later launch and renders it as an
// in-flight request whose elapsed clock grows without bound.
//
// This MUST run during startup BEFORE the HTTP server accepts connections. In
// that window no request can legitimately be in flight, so every 'pending' row
// present is provably an orphan from a previous process -- which is exactly what
// makes the unconditional rewrite safe. Calling it later would close live
// arrivals out from under their own in-flight requests.
//
// Only the outcome moves. http_status and duration_ms stay NULL, because the
// bridge never observed a response or a completion for these requests.
func SweepOrphanedCaptures(ctx context.Context, db *sql.DB) (int64, error) {
	if db == nil {
		return 0, unavailableError("capture store unavailable")
	}
	result, err := db.ExecContext(ctx, `
		UPDATE request_captures
		SET outcome = ?
		WHERE outcome = ?
	`, OutcomeAbandoned, OutcomePending)
	if err != nil {
		return 0, err
	}
	swept, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}
	return swept, nil
}
