package desktop

import (
	"context"
	"database/sql"
	"reflect"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/activityread"
	"autoreas-bridge/internal/observability/eventlog"
)

// recorderEmits collects every activity.recorder emission of one test app.
// With db set, it also counts the incidents stored at each emission, which
// proves the row is streamed before its incident is recorded.
type recorderEmits struct {
	mu               sync.Mutex
	entries          []activityread.RecorderEntry
	db               *sql.DB
	incidentsAtEmits []int
}

// emit is the App.emitFn test seam; it keeps only activity.recorder rows.
func (r *recorderEmits) emit(_ context.Context, eventName string, optionalData ...any) {
	if eventName != activityRecorderEventName || len(optionalData) != 1 {
		return
	}
	entry, ok := optionalData[0].(activityread.RecorderEntry)
	if !ok {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries = append(r.entries, entry)
	if r.db != nil {
		var count int
		_ = r.db.QueryRow(`SELECT COUNT(*) FROM incidents`).Scan(&count)
		r.incidentsAtEmits = append(r.incidentsAtEmits, count)
	}
}

// incidentsAtEmit returns the incident counts seen at each emission.
func (r *recorderEmits) incidentsAtEmit() []int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]int(nil), r.incidentsAtEmits...)
}

// snapshot returns the rows emitted so far.
func (r *recorderEmits) snapshot() []activityread.RecorderEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]activityread.RecorderEntry(nil), r.entries...)
}

// TestPersistedCaptureEmitsTheRecorderRow asserts a capture persisted through
// the default capture queue emits one activity.recorder row equal to the row
// the recorder read returns for it.
func TestPersistedCaptureEmitsTheRecorderRow(t *testing.T) {
	t.Parallel()
	app := newIncidentTestApp(t)
	emits := &recorderEmits{db: app.bridgeDB}
	app.ctx, app.emitFn = context.Background(), emits.emit
	record := terminalCaptureRecord("req-live", 500)
	record.Device.Name = "Pixel"
	record.ErrorCode = "internal"

	persistThroughDefaultCaptureQueue(t, app, record)

	page, err := activityread.New(app.bridgeDB).Recorder(context.Background(), activityread.RecorderInput{
		Now: time.UnixMilli(record.CapturedAtMS).Add(time.Minute),
	})
	if err != nil || len(page.Entries) != 1 {
		t.Fatalf("recorder read = %#v, %v", page, err)
	}
	got := emits.snapshot()
	if len(got) != 1 || !reflect.DeepEqual(got[0], page.Entries[0]) {
		t.Fatalf("emitted %#v, want [%#v]", got, page.Entries[0])
	}
	if counts := emits.incidentsAtEmit(); !reflect.DeepEqual(counts, []int{0}) {
		t.Fatalf("incidents stored at the emit = %v, want [0]: the row streams before its incident", counts)
	}
	if rows := readIncidentRows(t, app.bridgeDB); len(rows) != 1 {
		t.Fatalf("expected the incident path to still run, got %#v", rows)
	}
}

// TestPersistedEventEmitsTheRecorderRowAndRecordsItsIncident asserts an event
// persisted through the default event queue emits one activity.recorder row
// and still records its incident.
func TestPersistedEventEmitsTheRecorderRowAndRecordsItsIncident(t *testing.T) {
	t.Parallel()
	app := newIncidentTestApp(t)
	emits := &recorderEmits{db: app.bridgeDB}
	app.ctx, app.emitFn = context.Background(), emits.emit
	app.ensureRuntimeObservability()
	queue, ok := app.newEventQueue(app.bridgeDB).(*eventlog.Queue)
	if !ok {
		t.Fatal("expected the default event queue to be *eventlog.Queue")
	}
	record := eventlog.EventRecord{
		OccurredAtMS: incidentTestProcessStart.UnixMilli(), Domain: "downloads", Level: "error",
		Message: "boom", EventType: "download.failed", CorrelationID: "run-9",
	}

	queue.TryEnqueue(record)
	queue.Stop(context.Background())

	got := emits.snapshot()
	if len(got) != 1 || !reflect.DeepEqual(got[0], eventRecorderEntry(record)) {
		t.Fatalf("emitted %#v, want [%#v]", got, eventRecorderEntry(record))
	}
	if counts := emits.incidentsAtEmit(); !reflect.DeepEqual(counts, []int{0}) {
		t.Fatalf("incidents stored at the emit = %v, want [0]: the row streams before its incident", counts)
	}
	if rows := readIncidentRows(t, app.bridgeDB); len(rows) != 1 || rows[0].reason != "error_event" {
		t.Fatalf("expected one error_event incident, got %#v", rows)
	}
}

// TestEventRecorderEntryMatchesTheStoredRow asserts a persisted runtime event
// projects onto the recorder row the recorder read returns for it, ID aside:
// the event store hands back no row id.
func TestEventRecorderEntryMatchesTheStoredRow(t *testing.T) {
	t.Parallel()
	db := captureAppTestDB(t)
	at := time.UnixMilli(1_760_000_000_000)
	records := []eventlog.EventRecord{
		{OccurredAtMS: at.UnixMilli(), Domain: "download", Level: "error", Message: "failed", CorrelationID: "run-1",
			EventType: "download.failed", DurationMS: 42},
		{OccurredAtMS: at.UnixMilli() - 1, Domain: "season", Level: "info", Message: "rolled"},
	}
	store := eventlog.NewStore(db, eventlog.EventStoreConfig{})
	for _, record := range records {
		if err := store.InsertEvent(context.Background(), record); err != nil {
			t.Fatalf("insert event: %v", err)
		}
	}

	page, err := activityread.New(db).Recorder(context.Background(), activityread.RecorderInput{Now: at.Add(time.Minute)})
	if err != nil || len(page.Entries) != len(records) {
		t.Fatalf("recorder read = %#v, %v", page, err)
	}
	for i, record := range records {
		want := page.Entries[i]
		want.ID = ""
		if got := eventRecorderEntry(record); !reflect.DeepEqual(got, want) {
			t.Fatalf("eventRecorderEntry(%d) = %#v, want %#v", i, got, want)
		}
	}
	if got := eventRecorderEntry(eventlog.EventRecord{ID: 42}); got.ID != "42" {
		t.Fatalf("a record carrying its row id must keep it, got %q", got.ID)
	}
}

// TestActivityRecorderEmitIsNilSafeBeforeStartup asserts no emit happens and
// nothing panics before the Wails context and emitter are wired.
func TestActivityRecorderEmitIsNilSafeBeforeStartup(t *testing.T) {
	t.Parallel()
	emits := &recorderEmits{}
	(&App{emitFn: emits.emit}).emitActivityRecorder(activityread.RecorderEntry{ID: "x"})
	(&App{ctx: context.Background()}).emitActivityRecorder(activityread.RecorderEntry{ID: "x"})
	if got := emits.snapshot(); len(got) != 0 {
		t.Fatalf("expected no emit before startup, got %#v", got)
	}
}
