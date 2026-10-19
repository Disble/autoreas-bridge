package requestcapture

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
)

// rollupHourMS is the hourly rollup bucket width in milliseconds.
const rollupHourMS = int64(60 * 60 * 1000)

// priorCapture is the stored state of a capture row before an upsert,
// read inside the same transaction so the ledger counts each request once.
type priorCapture struct {
	exists       bool
	outcome      string
	responseHash string
}

// responseBodyHash returns the lowercase hex sha256 of the stored response
// body, or "" when the record carries no non-empty body.
func responseBodyHash(record CaptureRecord) string {
	if record.ResponseBody == nil || *record.ResponseBody == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(*record.ResponseBody))
	return hex.EncodeToString(sum[:])
}

// readPriorCapture loads the outcome and response hash already stored for
// requestID, reporting exists=false when there is no row yet.
func readPriorCapture(ctx context.Context, tx *sql.Tx, requestID string) (priorCapture, error) {
	prior := priorCapture{exists: true}
	err := tx.QueryRowContext(ctx, `SELECT outcome, response_hash FROM request_captures WHERE request_id = ?`, requestID).Scan(&prior.outcome, &prior.responseHash)
	if errors.Is(err, sql.ErrNoRows) {
		return priorCapture{}, nil
	}
	return prior, err
}

// recordLedger upserts the hourly rollup and the response version for one
// terminal write. The rollup counts a request only on its first terminal
// write (no row yet, or a pending arrival); a version counts a body only when
// it differs from the hash the row already stored, so a repeated terminal
// write of the same request adds nothing.
func recordLedger(ctx context.Context, tx *sql.Tx, record CaptureRecord, prior priorCapture, hash string) error {
	template := RouteTemplate(record.Route)
	if !prior.exists || prior.outcome == OutcomePending {
		if err := upsertRollup(ctx, tx, record, template); err != nil {
			return err
		}
	}
	if hash == "" || hash == prior.responseHash {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count)
		VALUES (?, ?, ?, ?, ?, 1)
		ON CONFLICT(route_template, body_hash) DO UPDATE SET
			first_seen_ms = MIN(response_versions.first_seen_ms, excluded.first_seen_ms),
			last_seen_ms = MAX(response_versions.last_seen_ms, excluded.last_seen_ms),
			seen_count = response_versions.seen_count + 1
	`, template, hash, *record.ResponseBody, record.CapturedAtMS, record.CapturedAtMS)
	return err
}

// upsertRollup adds one request to its (hour, route template, status class,
// device) bucket, keeping the largest duration seen.
func upsertRollup(ctx context.Context, tx *sql.Tx, record CaptureRecord, template string) error {
	statusClass := 0
	if record.HTTPStatus != nil {
		statusClass = *record.HTTPStatus / 100
	}
	duration := int64(0)
	if record.DurationMS != nil {
		duration = *record.DurationMS
	}
	hour := record.CapturedAtMS - record.CapturedAtMS%rollupHourMS
	_, err := tx.ExecContext(ctx, `
		INSERT INTO request_rollup_hourly (hour_ms, route_template, status_class, device_id, request_count, max_duration_ms)
		VALUES (?, ?, ?, ?, 1, ?)
		ON CONFLICT(hour_ms, route_template, status_class, device_id) DO UPDATE SET
			request_count = request_rollup_hourly.request_count + 1,
			max_duration_ms = MAX(request_rollup_hourly.max_duration_ms, excluded.max_duration_ms)
	`, hour, template, statusClass, record.Device.DeviceID, duration)
	return err
}
