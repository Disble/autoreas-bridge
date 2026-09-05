package desktop

import (
	"encoding/json"
	"strings"
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
	// The same record proves the other half: a collapsed row counts toward the badge but names
	// nothing, so it must never contribute a subject -- here, well below the subject cap, where
	// dropping the unnamed-row guard would show up as a phantom empty entry.
	if len(row.Subjects) != 1 || row.Subjects[0] != "Tensei shitara Slime Datta Ken" {
		t.Fatalf("Subjects = %#v, want only the one row that has a name", row.Subjects)
	}
}

// TestListNotificationsCountsAGroupHeadingOnlyOnce pins the other kind of summary row. Since the
// download producer stopped discarding the anime it collapsed, a summary row can HEAD a group
// whose rows are right there under it -- and those rows already count themselves. Counting the
// heading as well would badge a 3-anime run as "5x".
func TestListNotificationsCountsAGroupHeadingOnlyOnce(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Download run completed", Body: "b", Level: "success", Source: "download",
		Rows: []center.DetailRow{
			{Ref: center.EntityRef{Type: "anime", ID: "anime-1"}, Name: "Tensei shitara Slime Datta Ken", Status: "downloaded"},
			{Status: "ok", Detail: "2 anime finished without incident", CollapsedCount: 2},
			{Ref: center.EntityRef{Type: "anime", ID: "anime-2"}, Name: "Sousou no Frieren", Status: "up to date"},
			{Ref: center.EntityRef{Type: "anime", ID: "anime-3"}, Name: "Tenmaku no Jaadugar", Status: "skipped"},
		},
	})

	if row.RowCount != 3 {
		t.Fatalf("RowCount = %d, want 3 -- the heading's 2 anime are present rows, not extra ones", row.RowCount)
	}
	if len(row.Subjects) != 3 {
		t.Fatalf("Subjects = %#v, want all 3 named anime", row.Subjects)
	}
}

// TestListNotificationsCountsTheAnimeAGroupHeadingCouldNotCarry pins the mixed case a
// pathological run produces: the heading stands for more anime than the record could list, so
// the remainder -- and only the remainder -- is what it still contributes.
func TestListNotificationsCountsTheAnimeAGroupHeadingCouldNotCarry(t *testing.T) {
	t.Parallel()

	row := listOneNotification(t, center.Record{
		CreatedAtMS: 1000, Title: "Download run completed", Body: "b", Level: "success", Source: "download",
		Rows: []center.DetailRow{
			{Status: "ok", Detail: "1 anime finished without incident -- 4 more this run touched are not listed", CollapsedCount: 5},
			{Ref: center.EntityRef{Type: "anime", ID: "anime-2"}, Name: "Sousou no Frieren", Status: "up to date"},
		},
	})

	if row.RowCount != 5 {
		t.Fatalf("RowCount = %d, want 5 (the 1 listed anime + the 4 the record could not carry)", row.RowCount)
	}
}

// TestCountNotificationSubjectsNeverGoesNegative covers the clamp directly. No producer emits a
// heading standing for fewer anime than the rows following it, so only a direct call can reach
// the branch -- and a summary row that undercounts itself must still never subtract from the
// badge (AGENTS.md: a branch the scheduler cannot reach needs direct invocation).
func TestCountNotificationSubjectsNeverGoesNegative(t *testing.T) {
	t.Parallel()

	total := countNotificationSubjects([]center.DetailRow{
		{Status: "ok", Detail: "understated heading", CollapsedCount: 1},
		{Ref: center.EntityRef{Type: "anime", ID: "a-1"}, Name: "One", Status: "up to date"},
		{Ref: center.EntityRef{Type: "anime", ID: "a-2"}, Name: "Two", Status: "up to date"},
	})

	if total != 2 {
		t.Fatalf("countNotificationSubjects() = %d, want 2 -- the two present rows, with nothing subtracted", total)
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

// TestNotificationKindReachesBothWireReads pins the field the detail pane's metadata footer
// renders beside the correlation id. It rides on NotificationRow, which the detail embeds, so
// one mapping serves both reads -- and the list can filter on it without a second round trip.
func TestNotificationKindReachesBothWireReads(t *testing.T) {
	t.Parallel()

	app := notificationCenterAppTestDB(t)
	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000, Title: "Download stopped before the season finished", Body: "b",
		Level: "warning", Source: "download", Kind: "download.run_stopped_early", CorrelationID: "run-8f21c4",
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	page := app.ListNotifications(contracts.NotificationListRequest{Limit: 10})
	if len(page.Items) != 1 || page.Items[0].Kind != "download.run_stopped_early" {
		t.Fatalf("listed items = %#v, want the kind on the list read", page.Items)
	}

	detail := app.GetNotification(id)
	if !detail.Found || detail.Item.Kind != "download.run_stopped_early" {
		t.Fatalf("detail = %#v, want the kind on the detail read", detail.Item)
	}
	if detail.Item.Source != "download" {
		t.Fatalf("Source = %q, want it carried independently of the kind", detail.Item.Source)
	}
}

// TestAnAbsentKindIsOmittedFromTheWire pins requirement 4 at the boundary that decides it: the
// JSON tag. An empty kind must not reach the frontend as a present-but-blank field, or the
// metadata footer renders a labelled row with nothing in it.
func TestAnAbsentKindIsOmittedFromTheWire(t *testing.T) {
	t.Parallel()

	encoded, err := json.Marshal(contracts.NotificationRow{ID: 1, Title: "t", Body: "b", Level: "info", Source: "device"})
	if err != nil {
		t.Fatalf("marshal row: %v", err)
	}
	if strings.Contains(string(encoded), "kind") {
		t.Fatalf("encoded row = %s, want no kind key at all when the producer set none", encoded)
	}

	encoded, err = json.Marshal(contracts.NotificationRow{ID: 1, Title: "t", Body: "b", Level: "info", Source: "device", Kind: "device.paired"})
	if err != nil {
		t.Fatalf("marshal row: %v", err)
	}
	if !strings.Contains(string(encoded), `"kind":"device.paired"`) {
		t.Fatalf("encoded row = %s, want the kind present when the producer set one", encoded)
	}
}
