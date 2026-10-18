package requestcapture

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// SQLiteStore persists captures into bridge SQLite. Unlike Reader/ReadOnlyDB,
// it is a write path used only by the already-bootstrapped app, so it targets
// request_captures unconditionally rather than resolving a table generation --
// by the time this store is constructed, initializeBridgeDB has already
// renamed any previous-generation table in place.
type SQLiteStore struct {
	db *sql.DB
}

// NewStore builds a SQLite-backed capture store.
func NewStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
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

// UpsertCapture stores one capture, inserting it on first write (e.g. an
// arrival row) and updating every semantic/telemetry column in place on a
// later write sharing the same request_id (e.g. the terminal write following
// an arrival). captured_at_ms is deliberately excluded from the UPDATE
// clause so the arrival timestamp survives as the row's clock origin. A
// terminal write also records the hourly rollup and the response version in
// the same transaction (recordLedger).
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
	terminal := record.Outcome != OutcomePending
	var prior priorCapture
	if terminal {
		if prior, err = readPriorCapture(ctx, tx, record.RequestID); err != nil {
			return err
		}
	}
	hash := responseBodyHash(record)
	_, err = tx.ExecContext(ctx, upsertCaptureSQL, record.RequestID, record.CapturedAtMS, record.Kind, record.Route, record.Transport, record.Device.DeviceID, record.Device.Name, record.Outcome, record.AnimeID, record.HTTPStatus, args.payloadJSON, args.correlationJSON, record.ErrorCode,
		record.RequestBody, record.RequestBodyState, record.ResponseBody, record.ResponseBodyState, args.requestHeadersJSON, args.responseHeadersJSON, record.DurationMS, record.ErrorMessage, record.ClientRequestID,
		hash)
	if err != nil {
		return err
	}
	if terminal {
		if err = recordLedger(ctx, tx, record, prior, hash); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// upsertCaptureSQL inserts a capture row or updates it in place, never moving
// a terminal row back to pending.
const upsertCaptureSQL = `
			INSERT INTO request_captures (
				request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
				anime_id, http_status, payload_json, correlation_json, error_code,
				request_body, request_body_state, response_body, response_body_state, request_headers, response_headers, duration_ms, error_message, client_request_id,
				response_hash
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
				request_body = excluded.request_body,
				request_body_state = excluded.request_body_state,
				response_body = excluded.response_body,
				response_body_state = excluded.response_body_state,
				request_headers = excluded.request_headers,
				response_headers = excluded.response_headers,
				duration_ms = excluded.duration_ms,
				error_message = excluded.error_message,
				client_request_id = excluded.client_request_id,
				response_hash = excluded.response_hash
				WHERE NOT (request_captures.outcome <> 'pending' AND excluded.outcome = 'pending')
`
