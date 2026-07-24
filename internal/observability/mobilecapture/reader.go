package mobilecapture

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

// captureBaseColumns are the always-present (version-1) capture columns, in
// the fixed SELECT order every query relies on.
var captureBaseColumns = []string{
	"request_id", "captured_at_ms", "kind", "route", "transport", "device_id", "device_name", "outcome",
	"anime_id", "http_status", "payload_json", "correlation_json", "error_code",
}

// optionalCaptureColumns are the additive (version-2) telemetry columns. Order
// matters: it is the fixed order appended to captureBaseColumns whenever present.
var optionalCaptureColumns = []string{"response_body", "request_headers", "response_headers", "duration_ms"}

// optionalColumns records which additive telemetry columns exist on the open
// mobile_request_captures table, detected once at Reader construction.
type optionalColumns struct {
	responseBody    bool
	requestHeaders  bool
	responseHeaders bool
	durationMS      bool
}

// present reports whether the named optional column was detected.
func (o optionalColumns) present(name string) bool {
	switch name {
	case "response_body":
		return o.responseBody
	case "request_headers":
		return o.requestHeaders
	case "response_headers":
		return o.responseHeaders
	case "duration_ms":
		return o.durationMS
	default:
		return false
	}
}

// selectColumns returns the ordered SELECT column list: the fixed base
// columns followed by whichever optional columns are present.
func (o optionalColumns) selectColumns() []string {
	columns := append([]string(nil), captureBaseColumns...)
	for _, name := range optionalCaptureColumns {
		if o.present(name) {
			columns = append(columns, name)
		}
	}
	return columns
}

// NewReader builds a query helper over an already-open bridge DB. Optional
// telemetry columns are detected once here so Search/Get can tolerate a
// database that predates the additive schema (version 1).
func NewReader(db *sql.DB) *Reader {
	return &Reader{db: db, optional: detectOptionalColumns(db)}
}

// Reader provides read-only capture queries.
type Reader struct {
	db       *sql.DB
	optional optionalColumns
}

// ReadOnlyDB wraps a query-only SQLite handle.
type ReadOnlyDB struct{ db *sql.DB }

type searchCursor struct {
	CapturedAtMS int64  `json:"captured_at_ms"`
	RequestID    string `json:"request_id"`
}

// detectOptionalColumns probes pragma_table_info for the additive telemetry
// columns. Any failure is treated as "absent" so callers degrade gracefully.
func detectOptionalColumns(db *sql.DB) optionalColumns {
	present := map[string]bool{}
	rows, err := db.Query(`SELECT name FROM pragma_table_info('mobile_request_captures')`)
	if err != nil {
		return optionalColumns{}
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		present[name] = true
	}
	if err := rows.Err(); err != nil {
		return optionalColumns{}
	}
	return optionalColumns{
		responseBody:    present["response_body"],
		requestHeaders:  present["request_headers"],
		responseHeaders: present["response_headers"],
		durationMS:      present["duration_ms"],
	}
}

// OpenReadOnlyDB opens bridge SQLite in mode=ro and verifies presence.
func OpenReadOnlyDB(path string) (*ReadOnlyDB, error) {
	if strings.TrimSpace(path) == "" {
		return nil, unavailableError("bridge database path is required")
	}
	if _, err := os.Stat(path); err != nil {
		return nil, unavailableError("bridge database unavailable")
	}
	dsn := fmt.Sprintf("file:%s?mode=ro", filepath.ToSlash(path))
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, unavailableError("open read-only bridge database")
	}
	reader := &ReadOnlyDB{db: db}
	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	var version string
	var columns int
	err = db.QueryRow(`SELECT value, (SELECT count(*) FROM pragma_table_info('mobile_request_captures') WHERE name IN ('request_id','captured_at_ms','kind','route','transport','device_id','device_name','outcome','anime_id','http_status','payload_json','correlation_json','error_code')) FROM mobile_request_capture_metadata WHERE key = 'mobile_request_capture_schema_version'`).Scan(&version, &columns)
	if err != nil || !isSupportedCaptureSchemaVersion(version) || columns != 13 {
		_ = db.Close()
		return nil, schemaMismatchError("mobile capture schema mismatch")
	}
	return reader, nil
}

// isSupportedCaptureSchemaVersion reports whether the reader can tolerate the
// stored mobile_request_captures schema version. Version 1 predates the
// additive response/header/duration telemetry columns; version 2 adds them.
// Both are readable -- optional columns are detected and projected dynamically.
func isSupportedCaptureSchemaVersion(version string) bool {
	switch version {
	case "1", "2":
		return true
	default:
		return false
	}
}

// VerifyQueryOnly enables and verifies SQLite query_only mode.
func (r *ReadOnlyDB) VerifyQueryOnly(ctx context.Context) error {
	if r.db == nil {
		return unavailableError("bridge database unavailable")
	}
	if _, err := r.db.ExecContext(ctx, `PRAGMA query_only = ON;`); err != nil {
		return schemaMismatchError("failed to enable query_only")
	}
	var enabled int
	if err := r.db.QueryRowContext(ctx, `PRAGMA query_only;`).Scan(&enabled); err != nil {
		return schemaMismatchError("failed to verify query_only")
	}
	if enabled != 1 {
		return schemaMismatchError("query_only verification failed")
	}
	return nil
}

// Close closes the underlying DB handle.
func (r *ReadOnlyDB) Close() error { return r.db.Close() }

// DB exposes the raw query-only handle for tests/tools.
func (r *ReadOnlyDB) DB() *sql.DB { return r.db }

// encodeSearchCursor serializes the pagination cursor to URL-safe base64.
func encodeSearchCursor(cursor searchCursor) string {
	encoded, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(encoded)
}

// decodeSearchCursor parses a base64 search cursor into its parts.
func decodeSearchCursor(value string) (searchCursor, error) {
	encoded, err := base64.RawURLEncoding.DecodeString(value)
	var cursor searchCursor
	if err != nil || json.Unmarshal(encoded, &cursor) != nil || cursor.RequestID == "" {
		return searchCursor{}, invalidParamsError("invalid search cursor")
	}
	return cursor, nil
}

// captureRowScan holds the scan targets for one capture row: the fixed base
// columns plus whichever optional telemetry columns are present.
type captureRowScan struct {
	payloadJSON     string
	correlationJSON string
	animeID         sql.NullString
	httpStatus      sql.NullInt64
	responseBody    sql.NullString
	requestHeaders  sql.NullString
	responseHeaders sql.NullString
	durationMS      sql.NullInt64
}

// buildCaptureScanDest builds the ordered Scan() destination slice for one
// capture row: the fixed base columns into record, followed by the optional
// telemetry columns present in the trailing part of columns.
func buildCaptureScanDest(record *CaptureRecord, scan *captureRowScan, columns []string) []any {
	dest := []any{
		&record.RequestID, &record.CapturedAtMS, &record.Kind, &record.Route, &record.Transport,
		&record.Device.DeviceID, &record.Device.Name, &record.Outcome, &scan.animeID, &scan.httpStatus,
		&scan.payloadJSON, &scan.correlationJSON, &record.ErrorCode,
	}
	for _, column := range columns[len(captureBaseColumns):] {
		switch column {
		case "response_body":
			dest = append(dest, &scan.responseBody)
		case "request_headers":
			dest = append(dest, &scan.requestHeaders)
		case "response_headers":
			dest = append(dest, &scan.responseHeaders)
		case "duration_ms":
			dest = append(dest, &scan.durationMS)
		}
	}
	return dest
}

// applyCaptureCoreFields decodes the nullable anime id/HTTP status and the
// required payload/correlation JSON blobs from scan into record.
func applyCaptureCoreFields(record *CaptureRecord, scan captureRowScan) error {
	if scan.animeID.Valid {
		value := scan.animeID.String
		record.AnimeID = &value
	}
	if scan.httpStatus.Valid {
		value := int(scan.httpStatus.Int64)
		record.HTTPStatus = &value
	}
	if err := json.Unmarshal([]byte(scan.payloadJSON), &record.Payload); err != nil {
		return err
	}
	return json.Unmarshal([]byte(scan.correlationJSON), &record.Correlations)
}

// applyOptionalCaptureFields decodes the additive (version-2) telemetry
// columns from scan into record, ignoring any that are absent or malformed.
func applyOptionalCaptureFields(record *CaptureRecord, scan captureRowScan) {
	if scan.responseBody.Valid {
		value := scan.responseBody.String
		record.ResponseBody = &value
	}
	if scan.requestHeaders.Valid {
		var headers map[string]string
		if err := json.Unmarshal([]byte(scan.requestHeaders.String), &headers); err == nil {
			record.RequestHeaders = headers
		}
	}
	if scan.responseHeaders.Valid {
		var headers map[string]string
		if err := json.Unmarshal([]byte(scan.responseHeaders.String), &headers); err == nil {
			record.ResponseHeaders = headers
		}
	}
	if scan.durationMS.Valid {
		value := scan.durationMS.Int64
		record.DurationMS = &value
	}
}

// scanCaptureRow reads one capture row into a CaptureRecord. columns must
// match the exact SELECT column order produced by optionalColumns.selectColumns.
func scanCaptureRow(scanner interface{ Scan(dest ...any) error }, columns []string) (CaptureRecord, error) {
	var record CaptureRecord
	var scan captureRowScan

	if err := scanner.Scan(buildCaptureScanDest(&record, &scan, columns)...); err != nil {
		return CaptureRecord{}, err
	}
	if err := applyCaptureCoreFields(&record, scan); err != nil {
		return CaptureRecord{}, err
	}
	applyOptionalCaptureFields(&record, scan)
	record.Normalize()
	return record, nil
}
