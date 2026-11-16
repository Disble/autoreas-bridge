package requestcapture

import (
	"cmp"
	"context"
	"database/sql"
	"slices"
)

// SweptCapture names one arrival row the sweep closed: the request a previous
// process accepted and never finished. ClientRequestID is the client's
// `<cycleId>:<n>`, empty when the client sent none.
type SweptCapture struct {
	RequestID       string
	Route           string
	Kind            string
	CapturedAtMS    int64
	ClientRequestID string
}

// SweepOrphanedCaptures closes every capture row still stuck in its
// transport-only arrival shape (outcome 'pending'), marking it OutcomeAbandoned,
// and returns the closed rows oldest first.
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
// bridge never observed a response or a completion for these requests. The
// rows are returned because the request a hung process never finished is the
// one that names the hang, and retention later deletes the row itself.
func SweepOrphanedCaptures(ctx context.Context, db *sql.DB) ([]SweptCapture, error) {
	if db == nil {
		return nil, unavailableError("capture store unavailable")
	}
	rows, err := db.QueryContext(ctx, `
		UPDATE request_captures
		SET outcome = ?
		WHERE outcome = ?
		RETURNING request_id, route, kind, captured_at_ms, client_request_id
	`, OutcomeAbandoned, OutcomePending)
	if err != nil {
		return nil, err
	}
	// Only an early return leaves rows open: once Next reports false they are
	// already closed, and rows.Err below carries any iteration failure.
	defer func() { _ = rows.Close() }()
	var swept []SweptCapture
	for rows.Next() {
		var capture SweptCapture
		if err := rows.Scan(&capture.RequestID, &capture.Route, &capture.Kind, &capture.CapturedAtMS, &capture.ClientRequestID); err != nil {
			return nil, err
		}
		swept = append(swept, capture)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// RETURNING carries no order of its own.
	slices.SortFunc(swept, func(a, b SweptCapture) int {
		return cmp.Or(cmp.Compare(a.CapturedAtMS, b.CapturedAtMS), cmp.Compare(a.RequestID, b.RequestID))
	})
	return swept, nil
}
