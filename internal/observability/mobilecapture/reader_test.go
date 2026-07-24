package mobilecapture

import (
	"context"
	"net/http"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

func TestMissingDBReturnsUnavailable(t *testing.T) {
	t.Parallel()

	_, err := OpenReadOnlyDB(filepath.Join(t.TempDir(), "missing.db"))
	assertMobileCaptureErrorCode(t, err, "unavailable")
}

func TestReadOnlyDBEnforcesQueryOnly(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	reader, err := OpenReadOnlyDB(path)
	if err != nil {
		t.Fatalf("open read-only db: %v", err)
	}
	defer func() { _ = reader.Close() }()

	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only: %v", err)
	}

	if _, err := reader.DB().Exec(`DELETE FROM mobile_request_captures`); err == nil {
		t.Fatal("expected write attempt to fail in query-only mode")
	}
	if countRows(t, reader.DB(), "mobile_request_captures") != 0 {
		t.Fatal("expected capture row count to remain unchanged")
	}
}

func TestMutationIntentReturnsUnsupported(t *testing.T) {
	t.Parallel()

	err := ValidateToolName("delete_mobile_request_context")
	assertMobileCaptureErrorCode(t, err, "unsupported")
}

func TestMalformedRowSkippedDuringExactGet(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	_, err := db.Exec(`
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES
			('req-good', 20, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{"status":1}', '{"operation_refs":[]}'),
			('req-bad', 10, 'patch', '/api/animes/anime-2', 'http', 'device-2', 'Phone', 'accepted', '{bad', '{"operation_refs":[]}')
	`)
	if err != nil {
		t.Fatalf("seed captures: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-good")
	if err != nil {
		t.Fatalf("get capture: %v", err)
	}
	if !result.Found || result.Item.RequestID != "req-good" {
		t.Fatalf("expected exact get to find req-good, got %#v", result)
	}
	if result.MalformedRowsSkipped != 1 {
		t.Fatalf("expected malformed_rows_skipped 1, got %d", result.MalformedRowsSkipped)
	}
	if result.WarningCount != 1 {
		t.Fatalf("expected warning_count 1, got %d", result.WarningCount)
	}
}

func TestNullCorrelationSlicesNormalizedToEmptyArrays(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	_, err := db.Exec(`
		INSERT INTO mobile_request_captures (
			request_id, captured_at_ms, kind, route, transport, device_id, device_name, outcome, payload_json, correlation_json
		) VALUES
			('req-null', 10, 'patch', '/api/animes/anime-1', 'http', 'device-1', 'Phone', 'accepted', '{}', '{"changelog_ids":null,"operation_refs":null,"conflict_ids":null,"activity_ids":null}')
	`)
	if err != nil {
		t.Fatalf("seed capture: %v", err)
	}

	reader := NewReader(db)
	result, err := reader.Get(context.Background(), "req-null")
	if err != nil {
		t.Fatalf("get capture: %v", err)
	}
	if !result.Found {
		t.Fatal("expected capture to be found")
	}
	if result.Item.Correlations.ChangelogIDs == nil || len(result.Item.Correlations.ChangelogIDs) != 0 {
		t.Fatalf("expected empty changelog_ids, got %v", result.Item.Correlations.ChangelogIDs)
	}
	if result.Item.Correlations.OperationRefs == nil || len(result.Item.Correlations.OperationRefs) != 0 {
		t.Fatalf("expected empty operation_refs, got %v", result.Item.Correlations.OperationRefs)
	}
	if result.Item.Correlations.ConflictIDs == nil || len(result.Item.Correlations.ConflictIDs) != 0 {
		t.Fatalf("expected empty conflict_ids, got %v", result.Item.Correlations.ConflictIDs)
	}
	if result.Item.Correlations.ActivityIDs == nil || len(result.Item.Correlations.ActivityIDs) != 0 {
		t.Fatalf("expected empty activity_ids, got %v", result.Item.Correlations.ActivityIDs)
	}
	if result.Item.Payload == nil {
		t.Fatal("expected empty payload map, got nil")
	}
}

// assertMobileCaptureErrorCode asserts that err is a mobile capture error with the wanted code.
func assertMobileCaptureErrorCode(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatal("expected error")
	}
	mobileErr, ok := err.(Error)
	if !ok {
		t.Fatalf("expected mobile capture error, got %T (%v)", err, err)
	}
	if mobileErr.Code != want {
		t.Fatalf("expected code %q, got %#v", want, mobileErr)
	}
	if mobileErr.HTTPStatus == 0 {
		t.Fatalf("expected error to include http status, got %#v", mobileErr)
	}
	if want == "unsupported" && mobileErr.HTTPStatus != http.StatusMethodNotAllowed {
		t.Fatalf("expected method-not-allowed status for unsupported tool, got %#v", mobileErr)
	}
}
