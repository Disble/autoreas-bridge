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

// InsertCapture stores one sanitized capture and prunes older rows by count.
func (s *SQLiteStore) InsertCapture(ctx context.Context, record CaptureRecord) error {
	if s.db == nil {
		return unavailableError("capture store unavailable")
	}
	payloadJSON, err := json.Marshal(record.Payload)
	if err != nil {
		return fmt.Errorf("marshal capture payload: %w", err)
	}
	correlationJSON, err := json.Marshal(record.Correlations)
	if err != nil {
		return fmt.Errorf("marshal capture correlations: %w", err)
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
	requestHeadersJSON, err := marshalNullableHeaders(record.RequestHeaders)
	if err != nil {
		return fmt.Errorf("marshal capture request headers: %w", err)
	}
	responseHeadersJSON, err := marshalNullableHeaders(record.ResponseHeaders)
	if err != nil {
		return fmt.Errorf("marshal capture response headers: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code,
			response_body, request_headers, response_headers, duration_ms
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, record.RequestID, record.CapturedAtMS, record.Kind, record.Route, record.Transport, record.Device.DeviceID, record.Device.Name, record.Outcome, record.AnimeID, record.HTTPStatus, string(payloadJSON), string(correlationJSON), record.ErrorCode,
		record.ResponseBody, requestHeadersJSON, responseHeadersJSON, record.DurationMS)
	if err != nil {
		return err
	}
	s.successful++
	if s.successful%s.pruneEvery == 0 {
		if _, err = tx.ExecContext(ctx, `
			DELETE FROM mobile_request_captures
			WHERE request_id IN (
				SELECT request_id FROM mobile_request_captures
				ORDER BY captured_at_ms DESC, request_id DESC
				LIMIT -1 OFFSET ?
			)
		`, s.retentionLimit); err != nil {
			return err
		}
	}
	return tx.Commit()
}
