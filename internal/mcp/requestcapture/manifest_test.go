package requestcapture

import (
	"context"
	"database/sql"
	"reflect"
	"strconv"
	"testing"

	"autoreas-bridge/internal/observability/readcap"
	obs "autoreas-bridge/internal/observability/requestcapture"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestManifestMatchesCatalogAndServerRoster pins the sidecar declaration to
// the core catalog membership, its own observable order, and copy-on-read
// behavior.
func TestManifestMatchesCatalogAndServerRoster(t *testing.T) {
	t.Parallel()

	wantOrder := []string{
		"resolve_request_context",
		"search_requests",
		"get_request_context",
		"summary_requests",
		"search_events",
		"get_correlation_timeline",
		"summary_events",
	}
	got := ExposedCapabilities()
	assertUniqueCapabilityNames(t, got)
	if !sameCapabilityMembership(got, readcap.Names()) {
		t.Fatalf("expected catalog membership %#v, got %#v", readcap.Names(), got)
	}
	if !reflect.DeepEqual(got, wantOrder) {
		t.Fatalf("expected declared roster order %#v, got %#v", wantOrder, got)
	}
	if excluded := ExcludedCapabilities(); len(excluded) != 0 {
		t.Fatalf("expected no excluded capabilities, got %#v", excluded)
	}

	reader, err := OpenReader(openToolTestDB(t))
	if err != nil {
		t.Fatalf("open real reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })
	if serverTools := NewServer(reader).ToolNames(); !reflect.DeepEqual(serverTools, wantOrder) {
		t.Fatalf("expected server tools %#v, got %#v", wantOrder, serverTools)
	}

	got[0] = "mutated"
	if next := ExposedCapabilities(); !reflect.DeepEqual(next, wantOrder) {
		t.Fatalf("expected a fresh declared roster %#v after mutation, got %#v", wantOrder, next)
	}
}

// assertUniqueCapabilityNames fails when a manifest roster contains a duplicate
// name, which would otherwise make a membership-only comparison ambiguous.
func assertUniqueCapabilityNames(t *testing.T, names []string) {
	t.Helper()

	seen := make(map[string]struct{}, len(names))
	for _, name := range names {
		if _, duplicate := seen[name]; duplicate {
			t.Fatalf("expected capability %q only once, got %#v", name, names)
		}
		seen[name] = struct{}{}
	}
}

// sameCapabilityMembership reports whether two duplicate-free rosters contain
// the same capability names regardless of their independent order.
func sameCapabilityMembership(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	members := make(map[string]struct{}, len(left))
	for _, name := range left {
		members[name] = struct{}{}
	}
	if len(members) != len(left) {
		return false
	}
	for _, name := range right {
		if _, exists := members[name]; !exists {
			return false
		}
	}
	return true
}

// TestMCPReaderPreservesCoreRequestCaptureAnswers pins the MCP reader wrapper
// to the core reader's search, get, and grouped-summary projections.
func TestMCPReaderPreservesCoreRequestCaptureAnswers(t *testing.T) {
	t.Parallel()

	core, mcpReader := newManifestParityReaders(t)
	ctx := context.Background()

	corePage, err := core.Search(ctx, obs.SearchParams{Limit: 10})
	if err != nil {
		t.Fatalf("core search: %v", err)
	}
	mcpPage, err := mcpReader.Search(ctx, obs.SearchParams{Limit: 10})
	if err != nil {
		t.Fatalf("mcp search: %v", err)
	}
	if got, want := captureIDs(mcpPage.Items), captureIDs(corePage.Items); !reflect.DeepEqual(got, want) {
		t.Fatalf("search request ids differ: got %#v want %#v", got, want)
	}

	coreGet, err := core.Get(ctx, "req-2")
	if err != nil {
		t.Fatalf("core get: %v", err)
	}
	mcpGet, err := mcpReader.Get(ctx, "req-2")
	if err != nil {
		t.Fatalf("mcp get: %v", err)
	}
	if mcpGet.Found != coreGet.Found || mcpGet.Item.RequestID != coreGet.Item.RequestID {
		t.Fatalf("get result differs: got %#v want %#v", mcpGet, coreGet)
	}

	coreSummary, err := core.Summary(ctx, obs.SearchFilters{})
	if err != nil {
		t.Fatalf("core summary: %v", err)
	}
	mcpSummary, err := mcpReader.Summary(ctx, obs.SearchFilters{})
	if err != nil {
		t.Fatalf("mcp summary: %v", err)
	}
	if got, want := captureSummaryCounts(mcpSummary.Groups), captureSummaryCounts(coreSummary.Groups); !reflect.DeepEqual(got, want) {
		t.Fatalf("summary counts differ: got %#v want %#v", got, want)
	}
}

// newManifestParityReaders seeds one bridge database and returns the core and
// MCP read projections over its shared capture data.
func newManifestParityReaders(t *testing.T) (*obs.Reader, *sqliteReader) {
	t.Helper()

	path := openToolTestDB(t)
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	seedManifestCapture(t, db, "req-1", 100, "/api/animes", "accepted", 200)
	seedManifestCapture(t, db, "req-2", 200, "/api/animes", "rejected", 404)
	seedManifestCapture(t, db, "req-3", 300, "/api/sync", "accepted", 200)

	mcpReader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open mcp reader: %v", err)
	}
	t.Cleanup(func() { _ = mcpReader.Close() })
	return obs.NewReader(db), mcpReader
}

// seedManifestCapture inserts one minimal request capture with the supplied
// grouping fields.
func seedManifestCapture(t *testing.T, db *sql.DB, requestID string, capturedAtMS int64, route, outcome string, status int) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome,
			anime_id, http_status, payload_json, correlation_json, error_code
		) VALUES (?, ?, 'patch', ?, 'http', 'device-1', 'Phone', ?,
			'anime-1', ?, '{"status":1}', '{"operation_refs":[]}', '')
	`, requestID, capturedAtMS, route, outcome, status)
	if err != nil {
		t.Fatalf("seed capture row %s: %v", requestID, err)
	}
}

// captureIDs returns the request ids in reader order.
func captureIDs(items []obs.CaptureRecord) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.RequestID)
	}
	return ids
}

// captureSummaryCounts reduces summary groups to their grouping keys and
// counts, which is the aggregation parity contract between the readers.
func captureSummaryCounts(groups []obs.SummaryGroup) map[string]int {
	counts := make(map[string]int, len(groups))
	for _, group := range groups {
		status := "null"
		if group.HTTPStatus != nil {
			status = strconv.Itoa(*group.HTTPStatus)
		}
		counts[group.Route+"\x00"+status+"\x00"+group.Outcome] = group.Count
	}
	return counts
}
