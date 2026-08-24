package main

import (
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification/center"
)

// listOneNotification inserts record, lists it back through the real Wails binding, and returns
// the single wire row -- so every assertion below is made against what the master list actually
// receives, not against an in-memory mapper call.
func listOneNotification(t *testing.T, record center.Record) contracts.NotificationRow {
	t.Helper()
	app := notificationCenterAppTestDB(t)
	if _, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), record); err != nil {
		t.Fatalf("insert record: %v", err)
	}
	page := app.ListNotifications(contracts.NotificationListRequest{Limit: 10})
	if page.Degraded || len(page.Items) != 1 {
		t.Fatalf("page = %#v, want exactly 1 non-degraded item", page)
	}
	return page.Items[0]
}

// TestListNotificationsReportsTheRealActionCount replaces the assertion that pinned
// ActionCount at 0 for list rows. That zero was a description of an unfinished list query, never
// a requirement: the master list renders an "actions" affordance from this number, so a record
// carrying two tokens must report two.
func TestListNotificationsReportsTheRealActionCount(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Download run failed", Body: "b", Level: "error", Source: "download",
		Actions: []center.Action{
			{ID: "act-1", Ordinal: 0, Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
			{ID: "act-2", Ordinal: 1, RowRef: "anime-1", Label: "Run this anime again", Intent: "download.run_anime", Args: map[string]string{"animeId": "anime-1"}},
		},
	})

	if row.ActionCount != 2 {
		t.Fatalf("ActionCount = %d, want exactly 2", row.ActionCount)
	}
}

// TestListNotificationsCountsACollapsedRowAsEveryThingItStandsFor pins the count the master
// list's badge renders. A collapsed row is not one thing: it is the N uneventful anime the
// detail pane folded into a single line, and "3x" has to mean 3 anime, not 3 rows.
func TestListNotificationsCountsACollapsedRowAsEveryThingItStandsFor(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Download run completed", Body: "b", Level: "success", Source: "download",
		Rows: []center.DetailRow{
			{Ref: center.EntityRef{Type: "anime", ID: "anime-1"}, Name: "Tensei shitara Slime Datta Ken", Status: "downloaded"},
			{Status: "ok", Detail: "6 other anime finished without incident", CollapsedCount: 6},
		},
	})

	if row.RowCount != 7 {
		t.Fatalf("RowCount = %d, want 7 (1 named anime + the 6 the summary row stands for)", row.RowCount)
	}
}

// TestListNotificationsProjectsABoundedSubjectLine pins the "what is this about" line: it names
// the rows, capped, so a run touching fifty anime does not ship fifty strings on every item of
// every page. A collapsed row names nothing, so it contributes no subject.
func TestListNotificationsProjectsABoundedSubjectLine(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Scheduled anime need attention", Body: "b", Level: "warning", Source: "download",
		Rows: []center.DetailRow{
			{Ref: center.EntityRef{Type: "anime", ID: "a-1"}, Name: "Tensei shitara Slime Datta Ken", Status: "stopped"},
			{Ref: center.EntityRef{Type: "anime", ID: "a-2"}, Name: "Tenmaku no Jaadugar", Status: "stopped"},
			{Ref: center.EntityRef{Type: "anime", ID: "a-3"}, Name: "Nijuuseiki Denki Mokuroku", Status: "blocked"},
			{Ref: center.EntityRef{Type: "anime", ID: "a-4"}, Name: "Sousou no Frieren", Status: "blocked"},
			{Status: "ok", Detail: "2 other anime finished without incident", CollapsedCount: 2},
		},
	})

	if len(row.Subjects) != 3 {
		t.Fatalf("Subjects = %#v, want exactly 3 -- the list item is bounded, the detail pane is not", row.Subjects)
	}
	want := []string{"Tensei shitara Slime Datta Ken", "Tenmaku no Jaadugar", "Nijuuseiki Denki Mokuroku"}
	for i, name := range want {
		if row.Subjects[i] != name {
			t.Fatalf("Subjects[%d] = %q, want %q -- subjects follow row order", i, row.Subjects[i], name)
		}
	}
	if row.RowCount != 6 {
		t.Fatalf("RowCount = %d, want 6 (4 named + the 2 the summary row stands for)", row.RowCount)
	}
}

// TestListNotificationsProjectsNoSubjectsForARecordWithNothingToIndividuate pins the six kinds
// that carry no detail block at all: they must project an empty subject line and a zero count,
// never a phantom one.
func TestListNotificationsProjectsNoSubjectsForARecordWithNothingToIndividuate(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Download run started", Body: "b", Level: "info", Source: "download",
	})

	if len(row.Subjects) != 0 {
		t.Fatalf("Subjects = %#v, want none", row.Subjects)
	}
	if row.RowCount != 0 {
		t.Fatalf("RowCount = %d, want 0", row.RowCount)
	}
}
