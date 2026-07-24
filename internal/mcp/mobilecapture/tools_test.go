package mobilecapture

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	obs "autoreas-bridge/internal/observability/mobilecapture"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestSidecarFourToolsOnly(t *testing.T) {
	t.Parallel()

	server := NewServer(stubToolReader{})
	got := server.ToolNames()
	if len(got) != 4 {
		t.Fatalf("expected exactly 4 tools, got %#v", got)
	}
	want := map[string]bool{
		"resolve_mobile_request_context": true,
		"search_mobile_requests":         true,
		"get_mobile_request_context":     true,
		"summary_mobile_requests":        true,
	}
	for _, name := range got {
		if !want[name] {
			t.Fatalf("unexpected tool %q in surface %#v", name, got)
		}
	}
}

func TestSummaryToolReadOnly(t *testing.T) {
	t.Parallel()

	reader := &recordingToolReader{summary: obs.SummaryResult{Groups: []obs.SummaryGroup{{Route: "/api/animes/anime-1", Count: 2}}}}
	result, err := summaryMobileRequests(context.Background(), reader, SummaryMobileRequestsInput{Route: "/api/animes/anime-1"})
	if err != nil {
		t.Fatalf("summary mobile requests: %v", err)
	}
	if len(result.Groups) != 1 || result.Groups[0].Route != "/api/animes/anime-1" {
		t.Fatalf("unexpected summary result %#v", result)
	}
	if reader.lastFilters.Route != "/api/animes/anime-1" {
		t.Fatalf("expected route filter forwarded, got %#v", reader.lastFilters)
	}
}

func TestSearchFiltersPassthrough(t *testing.T) {
	t.Parallel()

	reader := &recordingToolReader{page: obs.SearchPage{AppliedLimit: 25}}
	status := 400
	_, err := searchMobileRequests(context.Background(), reader, SearchMobileRequestsInput{Route: "/api/sync/reconcile", Status: &status, ErrorCode: "apply_pending_failed"})
	if err != nil {
		t.Fatalf("search mobile requests: %v", err)
	}
	if reader.lastFilters.Route != "/api/sync/reconcile" || reader.lastFilters.HTTPStatus == nil || *reader.lastFilters.HTTPStatus != 400 || reader.lastFilters.ErrorCode != "apply_pending_failed" {
		t.Fatalf("expected filters forwarded to reader, got %#v", reader.lastFilters)
	}
}

func TestSearchDefaultLimit(t *testing.T) {
	t.Parallel()

	result, err := searchMobileRequests(context.Background(), stubToolReader{page: obs.SearchPage{AppliedLimit: 25}}, SearchMobileRequestsInput{})
	if err != nil {
		t.Fatalf("search mobile requests: %v", err)
	}
	if result.AppliedLimit != 25 {
		t.Fatalf("expected applied limit 25, got %#v", result)
	}
}

func TestSearchBoundedLimit(t *testing.T) {
	t.Parallel()

	reader := &recordingToolReader{page: obs.SearchPage{AppliedLimit: 100}}
	result, err := searchMobileRequests(context.Background(), reader, SearchMobileRequestsInput{Limit: 999, Cursor: "opaque"})
	if err != nil {
		t.Fatalf("search mobile requests: %v", err)
	}
	if result.AppliedLimit != 100 || reader.lastLimit != 100 || reader.lastCursor != "opaque" {
		t.Fatalf("expected bounded limit and forwarded cursor, got result=%#v params=%#v", result, reader)
	}
}

func TestSearchMapsInvalidCursor(t *testing.T) {
	realReader, err := OpenReader(openToolTestDB(t))
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = realReader.Close() }()
	_, err = searchMobileRequests(context.Background(), realReader, SearchMobileRequestsInput{Cursor: "not-a-valid-cursor"})
	var captureErr obs.Error
	if !errors.As(err, &captureErr) || captureErr.Code != "invalid_params" || captureErr.Retryable {
		t.Fatalf("expected non-retryable invalid_params, got %#v", err)
	}
}

func TestGetExposesPersistedReconcileChangelogIDs(t *testing.T) {
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer func() { _ = db.Close() }()
	record := obs.NewCaptureRecord("reconcile", "device-1")
	record.RequestID = "req-reconcile"
	record.Correlations.ChangelogIDs = []int64{41, 42}
	if err := obs.NewStore(db, obs.StoreConfig{}).InsertCapture(context.Background(), record); err != nil {
		t.Fatalf("persist capture: %v", err)
	}
	result, err := getMobileRequestContext(context.Background(), &sqliteReader{r: obs.NewReader(db)}, GetMobileRequestContextInput{RequestID: record.RequestID})
	if err != nil {
		t.Fatalf("get mobile request context: %v", err)
	}
	if got := result.Item.Correlations.ChangelogIDs; len(got) != 2 || got[0] != 41 || got[1] != 42 {
		t.Fatalf("expected MCP-visible changelog ids [41 42], got %#v", got)
	}
}

func TestResolveAmbiguousReference(t *testing.T) {
	t.Parallel()

	result, err := resolveMobileRequestContext(context.Background(), stubToolReader{candidates: []ResolveCandidate{{RequestID: "req-1"}, {RequestID: "req-2"}}}, ResolveMobileRequestContextInput{Reference: "phone"})
	if err != nil {
		t.Fatalf("resolve mobile request context: %v", err)
	}
	if len(result.Candidates) != 2 {
		t.Fatalf("expected 2 candidates, got %#v", result)
	}
}

func TestResolveTraversesAndRanksAllCorrelationFields(t *testing.T) {
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	store := obs.NewStore(db, obs.StoreConfig{})
	rankNames := []string{"Rank Key", "prefix rank key suffix"}
	for i := 0; i < 101; i++ {
		r := obs.NewCaptureRecord("patch", "filler")
		r.RequestID, r.CapturedAtMS = fmt.Sprintf("filler-%03d", i), int64(1000+i)
		if i < len(rankNames) {
			r.Device.Name = rankNames[i]
		}
		if err := store.InsertCapture(context.Background(), r); err != nil {
			t.Fatal(err)
		}
	}
	target := obs.NewCaptureRecord("reconcile", "device-key")
	target.RequestID, target.CapturedAtMS, target.Device.Name = "rank key", 1, "Device Name"
	animeID := "anime-key"
	target.AnimeID = &animeID
	target.Correlations.ChangelogIDs = []int64{4242}
	target.Correlations.OperationRefs = []obs.OperationRef{{AnimeID: "op-anime", Operation: "PATCH", Outcome: "applied"}}
	target.Correlations.ConflictIDs, target.Correlations.ActivityIDs = []string{"conflict-key"}, []int64{8181}
	if err := store.InsertCapture(context.Background(), target); err != nil {
		t.Fatal(err)
	}
	reader := &sqliteReader{r: obs.NewReader(db)}
	for _, reference := range []string{"device-key", "device name", "anime-key", "4242", "op-anime", "patch", "conflict-key", "8181"} {
		got, err := reader.Resolve(context.Background(), reference)
		if err != nil || len(got) != 1 || got[0].RequestID != target.RequestID {
			t.Fatalf("resolve %q: %#v, %v", reference, got, err)
		}
	}
	got, err := reader.Resolve(context.Background(), "  RANK \t KEY ")
	if err != nil || len(got) != 3 || got[0].RequestID != "rank key" || got[1].RequestID != "filler-000" || got[2].RequestID != "filler-001" {
		t.Fatalf("unexpected deterministic ranking %#v, %v", got, err)
	}
}

func TestGetExactMissNoFallback(t *testing.T) {
	t.Parallel()

	result, err := getMobileRequestContext(context.Background(), stubToolReader{get: obs.GetResult{Found: false}}, GetMobileRequestContextInput{RequestID: "missing"})
	if err != nil {
		t.Fatalf("get mobile request context: %v", err)
	}
	if result.Found {
		t.Fatalf("expected exact miss without fallback, got %#v", result)
	}
}

func TestTrustedDeviceNoCredential(t *testing.T) {
	t.Parallel()

	item := obs.NewCaptureRecord("patch", "device-1")
	item.Device.Name = "Phone"
	result, err := getMobileRequestContext(context.Background(), stubToolReader{get: obs.GetResult{Found: true, Item: item}}, GetMobileRequestContextInput{RequestID: "req-1"})
	if err != nil {
		t.Fatalf("get mobile request context: %v", err)
	}
	if result.Item.Device.DeviceID != "device-1" || result.Item.Device.Name != "Phone" {
		t.Fatalf("expected trusted device identity, got %#v", result.Item.Device)
	}
	if _, ok := result.Item.Payload["auth_token"]; ok {
		t.Fatalf("expected credentials to stay absent, got %#v", result.Item.Payload)
	}
}

func TestSensitiveMaterialExcluded(t *testing.T) {
	t.Parallel()

	item := obs.NewCaptureRecord("patch", "device-1")
	item.Payload["authorization"] = "Bearer secret"
	result, err := getMobileRequestContext(context.Background(), stubToolReader{get: obs.GetResult{Found: true, Item: item}}, GetMobileRequestContextInput{RequestID: "req-1"})
	if err != nil {
		t.Fatalf("get mobile request context: %v", err)
	}
	if _, ok := result.Item.Payload["authorization"]; ok {
		t.Fatalf("expected sensitive material to be stripped, got %#v", result.Item.Payload)
	}
}

func TestObservabilityDegradationAuxOnly(t *testing.T) {
	t.Parallel()

	_, err := OpenReader(filepath.Join(t.TempDir(), "missing.db"))
	if err == nil {
		t.Fatal("expected missing db to fail closed")
	}
}

// openToolTestDB creates a temporary initialized bridge database for tool tests.
func openToolTestDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	_ = db.Close()
	return path
}

type stubToolReader struct {
	page       obs.SearchPage
	get        obs.GetResult
	candidates []ResolveCandidate
}

func (s stubToolReader) Search(context.Context, obs.SearchParams) (obs.SearchPage, error) {
	return s.page, nil
}
func (s stubToolReader) Get(context.Context, string) (obs.GetResult, error) { return s.get, nil }
func (s stubToolReader) Resolve(context.Context, string) ([]ResolveCandidate, error) {
	return s.candidates, nil
}
func (s stubToolReader) Summary(context.Context, obs.SearchFilters) (obs.SummaryResult, error) {
	return obs.SummaryResult{}, nil
}

type recordingToolReader struct {
	page        obs.SearchPage
	summary     obs.SummaryResult
	lastLimit   int
	lastCursor  string
	lastFilters obs.SearchFilters
}

func (r *recordingToolReader) Search(_ context.Context, params obs.SearchParams) (obs.SearchPage, error) {
	r.lastLimit = params.Limit
	r.lastCursor = params.Cursor
	r.lastFilters = params.Filters
	return r.page, nil
}

func (*recordingToolReader) Get(context.Context, string) (obs.GetResult, error) {
	return obs.GetResult{}, nil
}
func (*recordingToolReader) Resolve(context.Context, string) ([]ResolveCandidate, error) {
	return nil, nil
}
func (r *recordingToolReader) Summary(_ context.Context, filters obs.SearchFilters) (obs.SummaryResult, error) {
	r.lastFilters = filters
	return r.summary, nil
}
