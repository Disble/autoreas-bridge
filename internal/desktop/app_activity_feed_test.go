package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

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
