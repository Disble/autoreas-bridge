package center

import (
	"context"
	"testing"

	"autoreas-bridge/internal/notification"
)

// persistOneNotification pushes n through a real Wrap'd Service backed by a bootstrapped
// SQLite database and returns the record as it reads back, so every assertion below is made
// against persisted state rather than against the in-memory conversion.
func persistOneNotification(t *testing.T, n notification.Notification) Record {
	t.Helper()
	store := NewStore(openBootstrappedTestDB(t), StoreConfig{})
	if err := Wrap(&spyNotifier{}, store).Notify(context.Background(), n); err != nil {
		t.Fatalf("Notify: %v", err)
	}
	page, err := store.List(context.Background(), ListQuery{View: ViewActive, Limit: 10})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("persisted %d records, want 1", len(page.Items))
	}
	record, found, err := store.Record(context.Background(), page.Items[0].ID)
	if err != nil || !found {
		t.Fatalf("Record: found=%v err=%v", found, err)
	}
	return record
}

// actionIDByLabel returns the persisted id of the action carrying label, failing the test when
// no such action exists. The ids are minted inside toActions, so a test can only address an
// action by something the producer chose.
func actionIDByLabel(t *testing.T, record Record, label string) string {
	t.Helper()
	for _, action := range record.Actions {
		if action.Label == label {
			return action.ID
		}
	}
	t.Fatalf("no persisted action labelled %q in %#v", label, record.Actions)
	return ""
}

// TestNotifyBindsARowScopedActionToItsOwnRowOnly is the core of the two-level token contract
// (design-canvas Intents.dc.html, "The record stores tokens, not buttons -- at two levels"):
// an ActionSpec naming a row must land on THAT row's ActionIDs, must carry the row reference
// on the persisted action, and must never leak onto a sibling row.
func TestNotifyBindsARowScopedActionToItsOwnRowOnly(t *testing.T) {
	t.Parallel()

	record := persistOneNotification(t, notification.Notification{
		Title:  "Download run completed with errors",
		Body:   "Some animes failed to download.",
		Level:  notification.LevelWarning,
		Source: "download",
		Rows: []notification.DetailItem{
			{RefType: "anime", RefID: "anime-1", Name: "First Anime", Status: "failed"},
			{RefType: "anime", RefID: "anime-2", Name: "Second Anime", Status: "failed"},
		},
		Actions: []notification.ActionSpec{
			{Label: "Run first again", Intent: "download.run_anime", Args: map[string]string{"animeId": "anime-1"}, RowRef: "anime-1"},
			{Label: "Run second again", Intent: "download.run_anime", Args: map[string]string{"animeId": "anime-2"}, RowRef: "anime-2"},
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
		},
	})

	firstID := actionIDByLabel(t, record, "Run first again")
	secondID := actionIDByLabel(t, record, "Run second again")

	if len(record.Rows) != 2 {
		t.Fatalf("persisted %d rows, want 2", len(record.Rows))
	}
	if got := record.Rows[0].ActionIDs; len(got) != 1 || got[0] != firstID {
		t.Fatalf("rows[0].ActionIDs = %#v, want exactly [%q]", got, firstID)
	}
	if got := record.Rows[1].ActionIDs; len(got) != 1 || got[0] != secondID {
		t.Fatalf("rows[1].ActionIDs = %#v, want exactly [%q]", got, secondID)
	}

	for _, action := range record.Actions {
		switch action.Label {
		case "Run first again":
			if action.RowRef != "anime-1" {
				t.Fatalf("row-scoped action RowRef = %q, want %q", action.RowRef, "anime-1")
			}
		case "Open Downloads":
			if action.RowRef != "" {
				t.Fatalf("whole-notification action RowRef = %q, want the empty string", action.RowRef)
			}
		}
	}
}

// TestNotifyNeverBindsAWholeNotificationActionToARowWithoutARef pins the guard that keeps the
// two levels apart. A collapsed summary row carries no entity reference, and a
// whole-notification action carries no row reference, so a naive equality match between the two
// empty strings would silently staple "Open Downloads" onto the summary line.
func TestNotifyNeverBindsAWholeNotificationActionToARowWithoutARef(t *testing.T) {
	t.Parallel()

	record := persistOneNotification(t, notification.Notification{
		Title:  "Download run completed",
		Body:   "Everything finished.",
		Level:  notification.LevelSuccess,
		Source: "download",
		Rows: []notification.DetailItem{
			{Status: "ok", Detail: "6 other anime finished without incident", CollapsedCount: 6},
		},
		Actions: []notification.ActionSpec{
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
		},
	})

	if len(record.Rows) != 1 {
		t.Fatalf("persisted %d rows, want 1", len(record.Rows))
	}
	if got := record.Rows[0].ActionIDs; len(got) != 0 {
		t.Fatalf("collapsed row ActionIDs = %#v, want none -- a whole-notification action is not a row action", got)
	}
}

// TestNotifyLeavesRowsUnboundWhenNoActionNamesThem pins the other direction: rows persist with
// no ActionIDs at all when every attached action is about the whole notification, so an
// unconditional "give every row every action" mutation fails here.
func TestNotifyLeavesRowsUnboundWhenNoActionNamesThem(t *testing.T) {
	t.Parallel()

	record := persistOneNotification(t, notification.Notification{
		Title:  "Available to create",
		Body:   "2 anime now available.",
		Level:  notification.LevelInfo,
		Source: "season",
		Rows: []notification.DetailItem{
			{RefType: "season_anime", RefID: "Sousou no Frieren", Name: "Sousou no Frieren", Status: "new"},
		},
		Actions: []notification.ActionSpec{
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
		},
	})

	if got := record.Rows[0].ActionIDs; len(got) != 0 {
		t.Fatalf("row ActionIDs = %#v, want none -- no action named this row", got)
	}
}

// TestNotifyPersistsTheProducerSKind pins the field the detail pane's metadata footer renders
// next to the correlation id. Source and Kind are NOT the same axis: source is the bounded
// context that raised the notification, kind is the specific event within it, so a mutation
// that persisted one in place of the other must fail here.
func TestNotifyPersistsTheProducerSKind(t *testing.T) {
	t.Parallel()

	record := persistOneNotification(t, notification.Notification{
		Title:  "Download stopped before the season finished",
		Body:   "2 of 9 anime were left incomplete.",
		Level:  notification.LevelWarning,
		Source: "download",
		Kind:   "download.run_stopped_early",
	})

	if record.Kind != "download.run_stopped_early" {
		t.Fatalf("Kind = %q, want the producer's kind", record.Kind)
	}
	if record.Source != "download" {
		t.Fatalf("Source = %q, want it untouched by the kind", record.Source)
	}
}

// TestNotifyPersistsAnAbsentKindAsAbsent pins the empty case as first-class: a producer that has
// not adopted the vocabulary yet must persist NO kind, never a placeholder derived from source.
func TestNotifyPersistsAnAbsentKindAsAbsent(t *testing.T) {
	t.Parallel()

	record := persistOneNotification(t, notification.Notification{
		Title: "Device paired", Body: "b", Level: notification.LevelInfo, Source: "device",
	})

	if record.Kind != "" {
		t.Fatalf("Kind = %q, want empty for a producer that set none", record.Kind)
	}
}
