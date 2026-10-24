package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/observability/activityread"
)

// TestSearchActivityFeedPassesItsQuery asserts the binding hands the range,
// origin, types, failure switch, cursor and limit to the feed reader with
// the app clock.
func TestSearchActivityFeedPassesItsQuery(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "schedule", "error", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-2*time.Minute), "season", "error", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-3*time.Minute), "schedule", "warn", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-20*time.Minute), "season", "error", "")

	query := ActivityFeedQuery{FromMS: activityAt(-10 * time.Minute), Origin: "bridge", Types: []string{"task"}, FailuresOnly: true, Limit: 1}
	first, err := app.SearchActivityFeed(query)
	if err != nil || len(first.Days) != 1 || len(first.Days[0].Lines) != 1 || first.NextCursor == "" {
		t.Fatalf("first page = %#v, %v; want one line and a cursor", first, err)
	}
	query.Cursor = first.NextCursor
	second, err := app.SearchActivityFeed(query)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	want, err := activityread.New(app.bridgeDB).Feed(context.Background(), activityread.FeedInput{
		Now: activityTestNow, FromMS: query.FromMS, Origin: activityread.OriginBridge, Types: []activityread.FeedType{activityread.FeedTask},
		FailuresOnly: true, Cursor: first.NextCursor, Limit: 1,
	})
	if err != nil || !reflect.DeepEqual(second, want) || second.NextCursor != "" || second.Days[0].Lines[0].Line.Level != "error" {
		t.Fatalf("second page = %#v, want %#v: the second error inside the range and no cursor (%v)", second, want, err)
	}
}

// TestActivityFeedBindingsReportAnUnwiredDatabase asserts the feed bindings
// fail like every Activity read before the database is wired.
func TestActivityFeedBindingsReportAnUnwiredDatabase(t *testing.T) {
	t.Parallel()
	app := &App{}
	if _, err := app.SearchActivityFeed(ActivityFeedQuery{}); !errors.Is(err, errActivityUnavailable) {
		t.Fatalf("feed: err = %v, want errActivityUnavailable", err)
	}
	if _, err := app.GetActivityOverview("24h", 0, 0, "all"); !errors.Is(err, errActivityUnavailable) {
		t.Fatalf("overview: err = %v, want errActivityUnavailable", err)
	}
}

// TestGetActivityOverviewPassesItsInputs asserts the binding reads the chart
// of its scale and the counts of its range and origin with the app clock.
func TestGetActivityOverviewPassesItsInputs(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "schedule", "error", "")
	seedActivityEvent(t, app.bridgeDB, activityAt(-20*time.Minute), "season", "warn", "")

	got, err := app.GetActivityOverview("7d", activityAt(-10*time.Minute), 0, "bridge")
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	want, err := activityread.New(app.bridgeDB).Overview(context.Background(), activityread.OverviewInput{
		Now: activityTestNow, Scale: activityread.Scale7d, FromMS: activityAt(-10 * time.Minute), Origin: activityread.OriginBridge,
	})
	if err != nil || !reflect.DeepEqual(got, want) || len(got.Slots) != 7 {
		t.Fatalf("overview = %#v, want %#v with 7 slots (%v)", got, want, err)
	}
	for _, c := range got.Types {
		if c.Type == activityread.FeedTask && (c.Lines != 1 || c.Failed != 1) {
			t.Fatalf("tasks = %+v, want the one error inside the range", c)
		}
	}
}

// TestGetActivityEventReadsOneEventByID asserts the binding returns the
// stored event with its metadata, and not found for an unknown id.
func TestGetActivityEventReadsOneEventByID(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	seedActivityEvent(t, app.bridgeDB, activityAt(-time.Minute), "frontend", "error", "")
	var id int64
	if err := app.bridgeDB.QueryRow(`SELECT MAX(id) FROM runtime_events`).Scan(&id); err != nil {
		t.Fatalf("event id: %v", err)
	}

	got, err := app.GetActivityEvent(id)
	if err != nil || !got.Found || got.Step.ID != id || got.Step.Domain != "frontend" || got.Step.EventType != "test.step" {
		t.Fatalf("GetActivityEvent = %#v, %v", got, err)
	}
	if missing, err := app.GetActivityEvent(id + 1); err != nil || missing.Found {
		t.Fatalf("missing event = %#v, %v; want not found", missing, err)
	}
	if _, err := (&App{}).GetActivityEvent(id); !errors.Is(err, errActivityUnavailable) {
		t.Fatalf("unwired: err = %v, want errActivityUnavailable", err)
	}
}

// TestGetActivityChangeContextReadsTheAnimesEventsAndCaptures asserts the
// binding returns the events and captures stored for the anime around the
// change it is asked for by id, not found for an unknown id, and
// errActivityUnavailable before the reader is wired.
func TestGetActivityChangeContextReadsTheAnimesEventsAndCaptures(t *testing.T) {
	t.Parallel()
	app := newActivityTestApp(t)
	at := activityAt(-time.Minute)
	if _, err := app.bridgeDB.Exec(`INSERT INTO runtime_events (occurred_at_ms, domain, level, message, correlation_id,
		entity_id, event_type) VALUES (?, 'sync', 'info', 'recorded pending changelog for 8Fn5qny6DPbhWLJn',
		'd4c0098786f004ebdc699c2d3caa4425', '8Fn5qny6DPbhWLJn', 'sync.changelog')`, at-2); err != nil {
		t.Fatalf("seed event: %v", err)
	}
	if _, err := app.bridgeDB.Exec(`INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport,
		device_id, device_name, outcome, http_status, payload_json, correlation_json)
		VALUES ('7e4b8c9f', ?, 'reconcile', '/api/sync/reconcile', 'http', 'device-3e4abdfd05f2ea61', 'Pixel 8a',
		'completed', 200, '{}', '{"changelog_ids":[2717],"operation_refs":[{"anime_id":"8Fn5qny6DPbhWLJn","operation":"update","outcome":"applied"}]}')`,
		at-20); err != nil {
		t.Fatalf("seed capture: %v", err)
	}

	changes := activity.NewStore(activity.NewSQLiteProvider(app.bridgeDB))
	if err := changes.RecordActivity(context.Background(), activity.Record{
		Source: "mobile", ActionType: "episode_adjusted", AnimeID: "8Fn5qny6DPbhWLJn", AnimeName: "Date A Live V",
		OccurredAtMs: at, CorrelationID: "anime.patch:8Fn5qny6DPbhWLJn:1792801492755",
	}); err != nil {
		t.Fatalf("seed change: %v", err)
	}
	recorded, err := changes.ListRecent(context.Background(), activity.ListQuery{Limit: 1})
	if err != nil || len(recorded) != 1 {
		t.Fatalf("read change back: %v, %d", err, len(recorded))
	}
	changeID := recorded[0].ID

	got, err := app.GetActivityChangeContext(changeID, at)
	if err != nil || !got.Found || len(got.Events) != 1 || got.Events[0].EventType != "sync.changelog" ||
		len(got.Requests) != 1 || got.Requests[0].LatestRequestID != "7e4b8c9f" {
		t.Fatalf("GetActivityChangeContext = %#v, %v", got, err)
	}
	if missing, err := app.GetActivityChangeContext(changeID+1, at); err != nil || missing.Found || len(missing.Events) != 0 {
		t.Fatalf("unknown change = %#v, %v; want not found", missing, err)
	}
	if _, err := (&App{}).GetActivityChangeContext(changeID, at); !errors.Is(err, errActivityUnavailable) {
		t.Fatalf("unwired: err = %v, want errActivityUnavailable", err)
	}
}
