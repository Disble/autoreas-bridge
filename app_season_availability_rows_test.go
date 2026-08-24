package main

import (
	"context"
	"testing"
)

// TestNotifySeasonAvailableIndividuatesEachAnimeAsARow closes the second half of the
// row-bearing gap: the season producer used to attach nothing, so the Anatomy artboard's
// "Available this season -- not in your catalog yet" row could never render. A season anime has
// no catalog id yet, so its name is the only reference the row can carry.
func TestNotifySeasonAvailableIndividuatesEachAnimeAsARow(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonAvailable(context.Background(), []string{"Sousou no Frieren", "Dandadan"})

	if len(notifier.received) != 1 {
		t.Fatalf("received %d notifications, want 1", len(notifier.received))
	}
	rows := notifier.received[0].Rows
	if len(rows) != 2 {
		t.Fatalf("rows = %#v, want one per available anime", rows)
	}
	if rows[0].Name != "Sousou no Frieren" || rows[0].RefID != "Sousou no Frieren" {
		t.Fatalf("rows[0] = %#v, want it to name and reference the anime", rows[0])
	}
	if rows[0].RefType != "season_anime" {
		t.Fatalf("rows[0].RefType = %q, want %q -- it is not a catalog anime yet", rows[0].RefType, "season_anime")
	}
	if rows[0].Status != "new" {
		t.Fatalf("rows[0].Status = %q, want %q", rows[0].Status, "new")
	}
	if rows[0].Detail == "" {
		t.Fatalf("rows[0] = %#v, want a detail line saying what the row is about", rows[0])
	}
	if rows[1].Name != "Dandadan" {
		t.Fatalf("rows[1] = %#v, want the second available anime", rows[1])
	}
}

// TestNotifySeasonAvailableCollapsesRowsPastTheBoundedLimit pins the bound. A batch of 40 must
// not produce 40 rows: the notification names what fits and folds the rest into ONE summary
// line, exactly like a download run does (notification-center spec, "Uneventful rows collapse
// into a single summary line").
func TestNotifySeasonAvailableCollapsesRowsPastTheBoundedLimit(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}
	names := []string{"A", "B", "C", "D", "E", "F", "G"}

	app.notifySeasonAvailable(context.Background(), names)

	rows := notifier.received[0].Rows
	if len(rows) != 6 {
		t.Fatalf("rows = %#v, want 5 named rows plus exactly 1 collapsed summary row", rows)
	}
	summary := rows[len(rows)-1]
	if summary.CollapsedCount != 2 {
		t.Fatalf("summary row = %#v, want CollapsedCount 2 for the names past the limit", summary)
	}
	if summary.Name != "" || summary.RefID != "" {
		t.Fatalf("summary row = %#v, want no name or reference -- it stands in for anime it does not name", summary)
	}
	for _, row := range rows[:len(rows)-1] {
		if row.CollapsedCount != 0 {
			t.Fatalf("named row %#v must not carry a collapsed count", row)
		}
	}
}

// TestNotifySeasonAvailableExactlyAtTheLimitAddsNoSummaryRow pins the boundary the other way: a
// batch that exactly fills the limit has nothing left to collapse, so a `>= limit` mutant that
// appended an empty "0 more" summary line must fail here.
func TestNotifySeasonAvailableExactlyAtTheLimitAddsNoSummaryRow(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := &App{notifier: notifier}

	app.notifySeasonAvailable(context.Background(), []string{"A", "B", "C", "D", "E"})

	rows := notifier.received[0].Rows
	if len(rows) != 5 {
		t.Fatalf("rows = %#v, want exactly 5 named rows and no summary row", rows)
	}
	for _, row := range rows {
		if row.CollapsedCount != 0 {
			t.Fatalf("row %#v carries a collapsed count, want none when nothing was collapsed", row)
		}
	}
}
