package mobilecapture

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// StoreConfig defines persistence policy.
type StoreConfig struct {
	RetentionLimit int
	PruneEvery     int
}

// SQLiteStore persists captures into bridge SQLite.
type SQLiteStore struct {
	db             *sql.DB
	retentionLimit int
	pruneEvery     int
	successful     int
}

// NewStore builds a SQLite-backed capture store.
func NewStore(db *sql.DB, config StoreConfig) *SQLiteStore {
	retentionLimit := config.RetentionLimit
	if retentionLimit <= 0 {
		retentionLimit = defaultRetentionLimit
	}
	pruneEvery := config.PruneEvery
	if pruneEvery <= 0 {
		pruneEvery = defaultPruneEvery
	}
	return &SQLiteStore{db: db, retentionLimit: retentionLimit, pruneEvery: pruneEvery}
}

// marshalNullableHeaders JSON-encodes a header map, returning a nil *string
// when the map is empty so the column binds as SQL NULL rather than "{}" .
func marshalNullableHeaders(headers map[string]string) (*string, error) {
	if len(headers) == 0 {
		return nil, nil
	}
	encoded, err := json.Marshal(headers)
	if err != nil {
		return nil, err
	}
	result := string(encoded)
	return &result, nil
}

// captureInsertArgs bundles the marshaled, ready-to-bind arguments UpsertCapture
// binds to the capture row's columns.
type captureInsertArgs struct {
	payloadJSON         string
	correlationJSON     string
	requestHeadersJSON  *string
	responseHeadersJSON *string
}

// buildCaptureInsertArgs JSON-marshals the record's structured fields into
// the bind arguments common to both the insert-only and upsert write paths.
func buildCaptureInsertArgs(record CaptureRecord) (captureInsertArgs, error) {
	payloadJSON, err := json.Marshal(record.Payload)
	if err != nil {
		return captureInsertArgs{}, fmt.Errorf("marshal capture payload: %w", err)
	}
	correlationJSON, err := json.Marshal(record.Correlations)
	if err != nil {
		return captureInsertArgs{}, fmt.Errorf("marshal capture correlations: %w", err)
	}
	requestHeadersJSON, err := marshalNullableHeaders(record.RequestHeaders)
	if err != nil {
		return captureInsertArgs{}, fmt.Errorf("marshal capture request headers: %w", err)
	}
	responseHeadersJSON, err := marshalNullableHeaders(record.ResponseHeaders)
	if err != nil {
		return captureInsertArgs{}, fmt.Errorf("marshal capture response headers: %w", err)
	}
	return captureInsertArgs{
		payloadJSON:         string(payloadJSON),
		correlationJSON:     string(correlationJSON),
		requestHeadersJSON:  requestHeadersJSON,
		responseHeadersJSON: responseHeadersJSON,
	}, nil
}

// pruneOldestBeyondRetention deletes the oldest capture rows past the
// configured retention limit, called every pruneEvery successful write.
func (s *SQLiteStore) pruneOldestBeyondRetention(ctx context.Context, tx *sql.Tx) error {
	s.successful++
	if s.successful%s.pruneEvery != 0 {
		return nil
	}
	_, err := tx.ExecContext(ctx, `
		DELETE FROM mobile_request_captures
		WHERE request_id IN (
			SELECT request_id FROM mobile_request_captures
			ORDER BY captured_at_ms DESC, request_id DESC
			LIMIT -1 OFFSET ?
		)
	`, s.retentionLimit)
	return err
}

// UpsertCapture stores one capture, inserting it on first write (e.g. an
// arrival row) and updating every semantic/telemetry column in place on a
// later write sharing the same request_id (e.g. the terminal write following
// an arrival). captured_at_ms is deliberately excluded from the UPDATE
// clause so the arrival timestamp survives as the row's clock origin.
func (s *SQLiteStore) UpsertCapture(ctx context.Context, record CaptureRecord) error {
	if s.db == nil {
		return unavailableError("capture store unavailable")
	}
	args, err := buildCaptureInsertArgs(record)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code,
			response_body, request_headers, response_headers, duration_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(request_id) DO UPDATE SET
			kind = excluded.kind,
			route = excluded.route,
			transport = excluded.transport,
			device_id = excluded.device_id,
			device_name = excluded.device_name,
			outcome = excluded.outcome,
			anime_id = excluded.anime_id,
			http_status = excluded.http_status,
			payload_json = excluded.payload_json,
			correlation_json = excluded.correlation_json,
			error_code = excluded.error_code,
			response_body = excluded.response_body,
			request_headers = excluded.request_headers,
			response_headers = excluded.response_headers,
			duration_ms = excluded.duration_ms
	`, record.RequestID, record.CapturedAtMS, record.Kind, record.Route, record.Transport, record.Device.DeviceID, record.Device.Name, record.Outcome, record.AnimeID, record.HTTPStatus, args.payloadJSON, args.correlationJSON, record.ErrorCode,
		record.ResponseBody, args.requestHeadersJSON, args.responseHeadersJSON, record.DurationMS)
	if err != nil {
		return err
	}
	if err = s.pruneOldestBeyondRetention(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
