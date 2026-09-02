package requestcapture

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

// schemaMismatchMessage is the single wording every schema-mismatch error carries.
const schemaMismatchMessage = "request capture schema mismatch"

// captureBaseColumns are the always-present (version-1) capture columns, in
// the fixed SELECT order every query relies on.
var captureBaseColumns = []string{
	"request_id", "captured_at_ms", "kind", "route", "transport", "device_id", "device_name", "outcome",
	"anime_id", "http_status", "payload_json", "correlation_json", "error_code",
}

// optionalCaptureColumns are the additive (version-2) telemetry columns. Order
// matters: it is the fixed order appended to captureBaseColumns whenever present.
var optionalCaptureColumns = []string{"request_body", "request_body_state", "response_body", "response_body_state", "request_headers", "response_headers", "duration_ms"}

// captureTables names the capture objects for one schema generation. The
// table/key names are interpolated directly into SQL strings because SQLite
// does not accept bound parameters for identifiers; this is safe only
// because a captureTables value is always one of the two package-level
// literals below (currentCaptureTables/previousCaptureTables), never derived
// from caller or database input -- a closed two-literal allow-list.
type captureTables struct {
	captures   string
	metadata   string
	versionKey string
}

// currentCaptureTables is the transport-neutral, steady-state capture schema.
var currentCaptureTables = captureTables{
	captures:   "request_captures",
	metadata:   "request_capture_metadata",
	versionKey: "request_capture_schema_version",
}

// previousCaptureTables is the previously-named capture schema, kept as a
// transitional read fallback until every bridge database has been renamed.
var previousCaptureTables = captureTables{
	captures:   "mobile_request_captures",
	metadata:   "mobile_request_capture_metadata",
	versionKey: "mobile_request_capture_schema_version",
}

// resolveCaptureTables picks the live capture-table generation, preferring
// the current (transport-neutral) names and falling back to the previously-
// named tables. It returns a schema-mismatch error only when neither
// generation's capture table exists.
func resolveCaptureTables(db *sql.DB) (captureTables, error) {
	for _, tables := range []captureTables{currentCaptureTables, previousCaptureTables} {
		exists, err := captureTableExists(db, tables.captures)
		if err != nil {
			return captureTables{}, err
		}
		if exists {
			return tables, nil
		}
	}
	return captureTables{}, schemaMismatchError(schemaMismatchMessage)
}

// captureTableExists reports whether name exists as a table in sqlite_master.
func captureTableExists(db *sql.DB, name string) (bool, error) {
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

// optionalColumns records which additive telemetry columns exist on the open
// capture table, detected once at Reader construction.
type optionalColumns struct {
	requestBody       bool
	requestBodyState  bool
	responseBody      bool
	responseBodyState bool
	requestHeaders    bool
	responseHeaders   bool
	durationMS        bool
}

// present reports whether the named optional column was detected.
func (o optionalColumns) present(name string) bool {
	switch name {
	case "request_body":
		return o.requestBody
	case "request_body_state":
		return o.requestBodyState
	case "response_body":
		return o.responseBody
	case "response_body_state":
		return o.responseBodyState
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
// database that predates the additive schema (version 1). Table-name
// resolution falls back to the current generation on failure -- the
// in-process caller builds this Reader over the app's own already-bootstrapped
// handle, so the current names are always live there, and the first query
// naturally surfaces any genuine mismatch.
func NewReader(db *sql.DB) *Reader {
	tables, err := resolveCaptureTables(db)
	if err != nil {
		tables = currentCaptureTables
	}
	return &Reader{db: db, tables: tables, optional: detectOptionalColumns(db, tables)}
}

// Reader provides read-only capture queries.
type Reader struct {
	db       *sql.DB
	tables   captureTables
	optional optionalColumns
}

// ReadOnlyDB wraps a query-only SQLite handle.
type ReadOnlyDB struct {
	db     *sql.DB
	tables captureTables
}

// Tables exposes the resolved capture-table generation for this handle.
func (r *ReadOnlyDB) Tables() captureTables { return r.tables }

type searchCursor struct {
	CapturedAtMS int64  `json:"captured_at_ms"`
	RequestID    string `json:"request_id"`
}

// detectOptionalColumns probes pragma_table_info for the additive telemetry
// columns on the resolved capture table. Any failure is treated as "absent"
// so callers degrade gracefully.
func detectOptionalColumns(db *sql.DB, tables captureTables) optionalColumns {
	present := map[string]bool{}
	// NOSONAR go:S2077 -- tables.captures is a compile-time internal literal,
	// never caller data; SQLite cannot bind an identifier as a parameter.
	rows, err := db.Query(fmt.Sprintf(`SELECT name FROM pragma_table_info('%s')`, tables.captures)) // NOSONAR
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
		requestBody:       present["request_body"],
		requestBodyState:  present["request_body_state"],
		responseBody:      present["response_body"],
		responseBodyState: present["response_body_state"],
		requestHeaders:    present["request_headers"],
		responseHeaders:   present["response_headers"],
		durationMS:        present["duration_ms"],
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
	tables, err := resolveCaptureTables(db)
	if err != nil {
		_ = db.Close()
		return nil, schemaMismatchError(schemaMismatchMessage)
	}
	reader.tables = tables
	var version string
	var columns int
	versionQuery := fmt.Sprintf(
		`SELECT value, (SELECT count(*) FROM pragma_table_info('%s') WHERE name IN ('request_id','captured_at_ms','kind','route','transport','device_id','device_name','outcome','anime_id','http_status','payload_json','correlation_json','error_code')) FROM %s WHERE key = '%s'`,
		tables.captures, tables.metadata, tables.versionKey,
	)
	// NOSONAR go:S2077 -- every %s in versionQuery (tables.captures/metadata/versionKey) is a compile-time internal literal,
	// never caller data; SQLite cannot bind an identifier as a parameter.
	err = db.QueryRow(versionQuery).Scan(&version, &columns) // NOSONAR
	if err != nil || !isSupportedCaptureSchemaVersion(version) || columns != 13 {
		_ = db.Close()
		return nil, schemaMismatchError(schemaMismatchMessage)
	}
	return reader, nil
}

// isSupportedCaptureSchemaVersion reports whether the reader can tolerate the
// stored capture schema version. Version 1 predates the additive
// response/header/duration telemetry columns; version 2 adds them; version 3
// is the transport-neutral table rename (Capture / MCP Nomenclature Rename);
// version 4 adds raw request_body; version 5 adds explicit request/response
// body capture-state markers. All supported generations
// are readable -- optional columns are detected and projected dynamically.
func isSupportedCaptureSchemaVersion(version string) bool {
	switch version {
	case "1", "2", "3", "4", "5":
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
	payloadJSON       string
	correlationJSON   string
	animeID           sql.NullString
	httpStatus        sql.NullInt64
	responseBody      sql.NullString
	requestBody       sql.NullString
	requestBodyState  sql.NullString
	responseBodyState sql.NullString
	requestHeaders    sql.NullString
	responseHeaders   sql.NullString
	durationMS        sql.NullInt64
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
		case "request_body":
			dest = append(dest, &scan.requestBody)
		case "request_body_state":
			dest = append(dest, &scan.requestBodyState)
		case "response_body":
			dest = append(dest, &scan.responseBody)
		case "response_body_state":
			dest = append(dest, &scan.responseBodyState)
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
	if scan.requestBody.Valid {
		value := scan.requestBody.String
		record.RequestBody = &value
	}
	if scan.requestBodyState.Valid {
		record.RequestBodyState = scan.requestBodyState.String
	}
	if scan.responseBody.Valid {
		value := scan.responseBody.String
		record.ResponseBody = &value
	}
	if scan.responseBodyState.Valid {
		record.ResponseBodyState = scan.responseBodyState.String
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
