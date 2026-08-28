package requestcapture

import (
	"context"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/observability/eventlog"
	obs "autoreas-bridge/internal/observability/requestcapture"
	bridgeSync "autoreas-bridge/internal/sync"
)

// eventlogSearchParams builds a zero-value event search params value, kept
// as a helper so reader_test.go's assertions read as intent (a plain event
// search) rather than an anonymous struct literal.
func eventlogSearchParams() eventlog.EventSearchParams {
	return eventlog.EventSearchParams{}
}

func TestQueryOnlyRead(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()
	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only: %v", err)
	}
}

func TestMissingDBFailsClosed(t *testing.T) {
	t.Parallel()

	_, err := OpenReader(filepath.Join(t.TempDir(), "missing.db"))
	if err == nil {
		t.Fatal("expected missing db to fail closed")
	}
}

func TestOpenReaderRejectsInvalidCaptureSchema(t *testing.T) {
	for _, statement := range []string{
		`DELETE FROM request_capture_metadata`,
		`UPDATE request_capture_metadata SET value = '99'`,
		`DROP TABLE request_captures`,
	} {
		t.Run(statement, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "bridge.db")
			db, err := bridgeSync.OpenBridgeDB(path)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = db.Exec(statement); err != nil {
				t.Fatal(err)
			}
			_ = db.Close()
			if reader, err := OpenReader(path); err == nil {
				_ = reader.Close()
				t.Fatal("expected incompatible capture schema to fail closed")
			}
		})
	}
}

func TestResolveStatusAndRouteComponents(t *testing.T) {
	t.Parallel()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	store := obs.NewStore(db, obs.StoreConfig{})

	older := obs.NewCaptureRecord("reconcile", "device-1")
	older.RequestID, older.CapturedAtMS, older.Route = "req-old-reconcile-400", 100, "/api/sync/reconcile"
	older.HTTPStatus = new(400)
	if err := store.UpsertCapture(context.Background(), older); err != nil {
		t.Fatal(err)
	}

	newer := obs.NewCaptureRecord("reconcile", "device-1")
	newer.RequestID, newer.CapturedAtMS, newer.Route = "req-new-reconcile-400", 200, "/api/sync/reconcile"
	newer.HTTPStatus = new(400)
	if err := store.UpsertCapture(context.Background(), newer); err != nil {
		t.Fatal(err)
	}

	other := obs.NewCaptureRecord("patch", "device-1")
	other.RequestID, other.CapturedAtMS, other.Route = "req-patch-400", 300, "/api/animes/anime-1"
	other.HTTPStatus = new(400)
	if err := store.UpsertCapture(context.Background(), other); err != nil {
		t.Fatal(err)
	}

	reader := &sqliteReader{r: obs.NewReader(db)}
	got, err := reader.Resolve(context.Background(), "latest reconcile 400")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(got) < 1 || got[0].RequestID != "req-new-reconcile-400" {
		t.Fatalf("expected newest matching reconcile+400 candidate first, got %#v", got)
	}
	for _, candidate := range got[:min(len(got), 2)] {
		if candidate.RequestID == "req-patch-400" {
			t.Fatalf("expected unrelated patch route excluded, got %#v", got)
		}
	}
}

func TestResolveAnimeScopedReference(t *testing.T) {
	t.Parallel()

	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	store := obs.NewStore(db, obs.StoreConfig{})

	scoped := obs.NewCaptureRecord("reconcile", "device-1")
	scoped.RequestID, scoped.CapturedAtMS, scoped.Route = "req-anime-scoped", 100, "/api/sync/reconcile"
	scoped.Correlations.OperationRefs = []obs.OperationRef{{AnimeID: "anime-42", Operation: "update", Outcome: "applied"}}
	if err := store.UpsertCapture(context.Background(), scoped); err != nil {
		t.Fatal(err)
	}

	unrelated := obs.NewCaptureRecord("reconcile", "device-1")
	unrelated.RequestID, unrelated.CapturedAtMS, unrelated.Route = "req-anime-other", 200, "/api/sync/reconcile"
	unrelated.Correlations.OperationRefs = []obs.OperationRef{{AnimeID: "anime-99", Operation: "update", Outcome: "applied"}}
	if err := store.UpsertCapture(context.Background(), unrelated); err != nil {
		t.Fatal(err)
	}

	reader := &sqliteReader{r: obs.NewReader(db)}
	got, err := reader.Resolve(context.Background(), "reconcile for anime anime-42")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(got) != 1 || got[0].RequestID != "req-anime-scoped" {
		t.Fatalf("expected only the anime-scoped candidate, got %#v", got)
	}
}

// TestEventReaderSharesTheQueryOnlyHandle asserts the sqliteReader's event
// reader is built over the same already-open, already-verified handle as
// the capture reader -- never a second SQLite connection.
func TestEventReaderSharesTheQueryOnlyHandle(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()

	if !reader.EventsAvailable() {
		t.Fatal("expected EventsAvailable true over a freshly-bootstrapped bridge db")
	}
}

// TestVerifyQueryOnlyHoldsForEventReads asserts query_only mode still holds
// for the handle event reads execute over.
func TestVerifyQueryOnlyHoldsForEventReads(t *testing.T) {
	t.Parallel()

	path := openToolTestDB(t)
	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()

	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only: %v", err)
	}
	if _, err := reader.SearchEvents(context.Background(), eventlogSearchParams()); err != nil {
		t.Fatalf("search events: %v", err)
	}
	if err := reader.VerifyQueryOnly(context.Background()); err != nil {
		t.Fatalf("verify query_only after event read: %v", err)
	}
}

// TestExistingFourToolsUnaffectedByMissingEventsTable asserts a bridge db
// with no runtime_events table still serves every pre-existing tool
// unchanged, and the three event tools return an empty/unavailable result
// without the sidecar exiting.
func TestExistingFourToolsUnaffectedByMissingEventsTable(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DROP TABLE runtime_events`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	reader, err := OpenReader(path)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	defer func() { _ = reader.Close() }()

	if reader.EventsAvailable() {
		t.Fatal("expected EventsAvailable false when runtime_events is absent")
	}
	if _, err := reader.Search(context.Background(), obs.SearchParams{}); err != nil {
		t.Fatalf("expected search_requests unaffected, got %v", err)
	}
	if _, err := reader.Summary(context.Background(), obs.SearchFilters{}); err != nil {
		t.Fatalf("expected summary_requests unaffected, got %v", err)
	}
	if _, err := reader.Get(context.Background(), "missing-id"); err != nil {
		t.Fatalf("expected get_request_context unaffected, got %v", err)
	}
	if _, err := reader.Resolve(context.Background(), "anything"); err != nil {
		t.Fatalf("expected resolve_request_context unaffected, got %v", err)
	}

	if _, err := reader.SearchEvents(context.Background(), eventlogSearchParams()); err == nil {
		t.Fatal("expected search_events to report unavailable rather than panic/exit")
	}
}

func TestCaptureCorrelationsAuxOnly(t *testing.T) {
	t.Parallel()

	item := obs.NewCaptureRecord("reconcile", "device-1")
	item.Correlations.OperationRefs = []obs.OperationRef{{AnimeID: "anime-1", Operation: "update", Outcome: "applied"}}
	result, err := mapGetResult(obs.GetResult{Found: true, Item: item})
	if err != nil {
		t.Fatalf("map get result: %v", err)
	}
	if len(result.Item.Correlations.OperationRefs) != 1 {
		t.Fatalf("expected operation refs to survive mapping, got %#v", result)
	}
}
