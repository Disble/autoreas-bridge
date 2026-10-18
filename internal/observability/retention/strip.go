package retention

import (
	"context"
	"database/sql"
	"fmt"

	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/persistence"
)

// slowMS is the duration above which a request counts as slow; it mirrors
// incident.SlowThreshold, and a slow row keeps its body whether or not it opened an incident.
const slowMS = 1000

// strippableCaptures selects the rows whose response body the sweep may move out (design L15
// D-f): kept only because a live incident window pins them, successful (2xx or 3xx, not
// refused), not slow, not an incident's trigger, and still holding a hashed body. It runs after
// the recorder step of the same pass, so every row older than the recorder span that is neither
// journal nor WebSocket ledger is already one a live incident pins. Argument: recorder cutoff.
var strippableCaptures = `SELECT request_id, route FROM request_captures
	WHERE captured_at_ms < ?
		AND NOT ` + JournalCapture + ` AND NOT ` + WebSocketCapture + `
		AND http_status BETWEEN 200 AND 399
		AND outcome NOT IN ('rejected', 'malformed')
		AND COALESCE(duration_ms, 0) <= ` + fmt.Sprint(slowMS) + `
		AND NOT EXISTS (SELECT 1 FROM incidents WHERE incidents.source_id = request_captures.request_id)
		AND response_body IS NOT NULL
		AND COALESCE(response_hash, '') <> ''
		AND EXISTS (SELECT 1 FROM response_versions WHERE response_versions.body_hash = request_captures.response_hash)`

// stripBody nulls one row's response body when response_versions holds it under the row's route
// template. A full body is marked CaptureStateInResponseVersions; any other state (truncated) is
// kept so the reader can restore it. The request body is never touched.
const stripBody = `UPDATE request_captures
	SET response_body = NULL,
		response_body_state = CASE WHEN COALESCE(response_body_state, '') = '' THEN ? ELSE response_body_state END
	WHERE request_id = ? AND response_body IS NOT NULL
		AND EXISTS (SELECT 1 FROM response_versions
			WHERE response_versions.route_template = ? AND response_versions.body_hash = request_captures.response_hash)`

// strippable is one candidate row of strippableCaptures.
type strippable struct {
	requestID string
	route     string
}

// stripVersionedBodies moves the response bodies of strippableCaptures rows out to
// response_versions, keyed by requestcapture.RouteTemplate exactly as recordLedger stores them.
// It is idempotent: a stripped row no longer has a body, so a later pass skips it.
func stripVersionedBodies(ctx context.Context, db *sql.DB, recorderCutoff int64) (int64, error) {
	var stripped int64
	err := persistence.InTx(ctx, db, func(tx *sql.Tx) error {
		candidates, err := readStrippable(ctx, tx, recorderCutoff)
		if err != nil {
			return err
		}
		for _, candidate := range candidates {
			outcome, err := tx.ExecContext(ctx, stripBody, requestcapture.CaptureStateInResponseVersions,
				candidate.requestID, requestcapture.RouteTemplate(candidate.route))
			if err != nil {
				return err
			}
			changed, err := outcome.RowsAffected()
			if err != nil {
				return err
			}
			stripped += changed
		}
		return nil
	})
	if err != nil {
		return 0, fmt.Errorf("strip versioned bodies: %w", err)
	}
	return stripped, nil
}

// readStrippable loads every strippableCaptures row before any update runs.
func readStrippable(ctx context.Context, tx *sql.Tx, recorderCutoff int64) ([]strippable, error) {
	rows, err := tx.QueryContext(ctx, strippableCaptures, recorderCutoff)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var candidates []strippable
	for rows.Next() {
		var candidate strippable
		if err := rows.Scan(&candidate.requestID, &candidate.route); err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}
