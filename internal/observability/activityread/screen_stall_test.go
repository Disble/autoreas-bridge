package activityread

import (
	"context"
	"testing"
)

// screenStallPayload is a stored screen_stall payload as the telemetry kind
// writes it.
const screenStallPayload = `{"duration_ms":120000,"trigger":"app_active","app_state":"active","window_focused":null,"window_width":600,"window_height":900,"screen_width":1200,"screen_height":900,"transitions":[]}`

// TestHistoryListsAScreenStallByItsTriggerAndDuration asserts a stall is a
// phone report line findable by time, labelled with its trigger and duration
// because it carries no outcome.
func TestHistoryListsAScreenStallByItsTriggerAndDuration(t *testing.T) {
	db, reader := openTestReader(t)
	insertTelemetryOfKind(t, db, "screen_stall", "stall-1", minutesAgo(5), minutesAgo(7), screenStallPayload)

	view, err := reader.History(context.Background(), HistoryInput{Now: testNow, Where: WherePhone, Limit: MaxPageLimit})
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	lines := flatten(view)
	if len(lines) != 1 {
		t.Fatalf("lines = %+v, want one phone report", lines)
	}
	line := lines[0]
	if line.Kind != LinePhoneReport || line.Title != "screen_stall" || line.Detail != "app_active 120000 ms" ||
		line.AtMS != minutesAgo(5) || line.PhoneAtMS == nil || *line.PhoneAtMS != minutesAgo(7) {
		t.Fatalf("line = %+v", line)
	}
}

// TestIncidentDetailShowsTheScreenStallThatOpenedIt asserts the stall that
// triggered an incident appears among the window's phone reports.
func TestIncidentDetailShowsTheScreenStallThatOpenedIt(t *testing.T) {
	db, reader := openTestReader(t)
	at := minutesAgo(60)
	insertTelemetryOfKind(t, db, "screen_stall", "stall-1", at, at-120_000, screenStallPayload)
	id := insertIncident(t, db, "mobile_failure|screen_stall|app_active", "mobile_failure", at, "mobile", "stall-1")

	detail, err := reader.IncidentDetail(context.Background(), id)
	if err != nil {
		t.Fatalf("IncidentDetail: %v", err)
	}
	if len(detail.PhoneReports) != 1 || detail.PhoneReports[0].Kind != "screen_stall" ||
		detail.PhoneReports[0].Outcome != "app_active 120000 ms" {
		t.Fatalf("phone reports = %+v", detail.PhoneReports)
	}
}
