package center

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"

	"autoreas-bridge/internal/notification"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// spyNotifier records every Notify invocation for assertion.
type spyNotifier struct {
	calls []notification.Notification
}

func (s *spyNotifier) Notify(_ context.Context, n notification.Notification) error {
	s.calls = append(s.calls, n)
	return nil
}

func TestWrapWithNilStoreReturnsInnerByIdentity(t *testing.T) {
	t.Parallel()

	inner := &spyNotifier{}
	got := Wrap(inner, nil)

	if got != inner {
		t.Fatalf("expected Wrap(inner, nil) to return inner by identity, got %#v", got)
	}
}

func TestWrapWithNilInnerReturnsNil(t *testing.T) {
	t.Parallel()

	got := Wrap(nil, &Store{})

	if got != nil {
		t.Fatalf("expected Wrap(nil, store) to return a bare nil interface, got %#v", got)
	}
}

// TestServiceNotifyPersistFailureStillDispatches is the MANDATORY R-1
// regression guard: a persist failure must never suppress delegation to the
// wrapped Notifier. The store here is real but wired to a fresh SQLite file
// with no schema applied, so InsertRecord's INSERT genuinely fails ("no such
// table") rather than merely simulating a failure.
func TestServiceNotifyPersistFailureStillDispatches(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "no-schema.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store := NewStore(db, StoreConfig{})

	spy := &spyNotifier{}
	svc := Wrap(spy, store)

	want := notification.Notification{
		Title:  "download finished",
		Body:   "One Piece is ready",
		Level:  notification.LevelSuccess,
		Source: "download",
	}
	notifyErr := svc.Notify(context.Background(), want)

	if notifyErr == nil {
		t.Fatal("expected Notify to return the persist failure")
	}
	if len(spy.calls) != 1 {
		t.Fatalf("expected the wrapped notifier to be invoked exactly once despite the persist failure, got %d calls", len(spy.calls))
	}
	// Rows/Actions are slices, so Notification is no longer comparable via == -- DeepEqual is the
	// direct replacement, not a weaker check: both nil-vs-nil and populated-vs-populated compare
	// correctly, unlike a field-by-field comparison that would need updating every time
	// Notification grows another field.
	if !reflect.DeepEqual(spy.calls[0], want) {
		t.Fatalf("expected the wrapped notifier to receive the identical Notification value, got %#v", spy.calls[0])
	}
}

func TestServiceNotifyPersistSuccessDispatchesAndReturnsNil(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	spy := &spyNotifier{}
	svc := Wrap(spy, store)

	want := notification.Notification{
		Title:  "download finished",
		Body:   "One Piece is ready",
		Level:  notification.LevelSuccess,
		Source: "download",
	}
	err := svc.Notify(context.Background(), want)

	if err != nil {
		t.Fatalf("expected Notify to return nil on persist success, got %v", err)
	}
	if len(spy.calls) != 1 {
		t.Fatalf("expected the wrapped notifier to be invoked exactly once, got %d calls", len(spy.calls))
	}
	// Rows/Actions are slices, so Notification is no longer comparable via == -- DeepEqual is the
	// direct replacement, not a weaker check: both nil-vs-nil and populated-vs-populated compare
	// correctly, unlike a field-by-field comparison that would need updating every time
	// Notification grows another field.
	if !reflect.DeepEqual(spy.calls[0], want) {
		t.Fatalf("expected the wrapped notifier to receive the identical Notification value, got %#v", spy.calls[0])
	}
}

// TestServiceNotifyUnopenedDBDegradesWithoutPanic mirrors
// app_test_helpers_test.go:30's exact bare &sql.DB{} shape (used by every
// app package test that never opens a real bridge database).
func TestServiceNotifyUnopenedDBDegradesWithoutPanic(t *testing.T) {
	t.Parallel()

	store := NewStore(&sql.DB{}, StoreConfig{})
	spy := &spyNotifier{}
	svc := Wrap(spy, store)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("expected Notify to degrade to dispatch-only without panicking, got panic: %v", r)
		}
	}()

	_ = svc.Notify(context.Background(), notification.Notification{
		Title:  "device paired",
		Level:  notification.LevelSuccess,
		Source: "device",
	})

	if len(spy.calls) != 1 {
		t.Fatalf("expected the wrapped notifier to be invoked exactly once, got %d calls", len(spy.calls))
	}
}

// TestNotifyConvertsProducerAttachedRowsAndActionsIntoPersistedRecord is the mandatory port-
// conversion guard: a Notification carrying producer-attached DetailItems/ActionSpecs must
// persist as a Record whose Rows/Actions reflect them, with a freshly generated Action.ID --
// dropping a row or an action here must fail this test.
func TestNotifyConvertsProducerAttachedRowsAndActionsIntoPersistedRecord(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	store := NewStore(db, StoreConfig{})
	spy := &spyNotifier{}
	svc := Wrap(spy, store)

	n := notification.Notification{
		Title:  "Download run completed with errors",
		Body:   "Some animes failed to download.",
		Level:  notification.LevelWarning,
		Source: "download",
		Rows: []notification.DetailItem{
			{RefType: "anime", RefID: "anime-1", Name: "First Anime", Status: "failed", Detail: "hoster_down"},
			{RefType: "anime", RefID: "anime-2", Name: "Second Anime", Status: "manual", Detail: "1 episode(s)"},
		},
		Actions: []notification.ActionSpec{
			{Label: "Run again", Intent: "download.run_anime", Args: map[string]string{"animeId": "anime-1"}},
		},
	}

	if err := svc.Notify(context.Background(), n); err != nil {
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

	if len(record.Rows) != 2 {
		t.Fatalf("persisted %d rows, want 2 -- dropping a row must fail this test", len(record.Rows))
	}
	if record.Rows[0].Ref.Type != "anime" || record.Rows[0].Ref.ID != "anime-1" || record.Rows[0].Name != "First Anime" {
		t.Fatalf("row[0] = %#v, want it to carry the producer's ref/name", record.Rows[0])
	}
	if record.Rows[1].Ref.ID != "anime-2" || record.Rows[1].Status != "manual" {
		t.Fatalf("row[1] = %#v, want it to carry the producer's ref/status", record.Rows[1])
	}

	if len(record.Actions) != 1 {
		t.Fatalf("persisted %d actions, want 1 -- dropping an action must fail this test", len(record.Actions))
	}
	if record.Actions[0].ID == "" {
		t.Fatal("persisted action has an empty ID, want a freshly generated token")
	}
	if record.Actions[0].Label != "Run again" || record.Actions[0].Intent != "download.run_anime" {
		t.Fatalf("action[0] = %#v, want it to carry the producer's label/intent", record.Actions[0])
	}
	if record.Actions[0].Args["animeId"] != "anime-1" {
		t.Fatalf("action[0].Args = %#v, want the producer's frozen args", record.Actions[0].Args)
	}
}

// TestToDetailRowsAndToActionsReturnNilForEmptyInput pins the exact contract toDetailRows/
// toActions' doc comments claim ("A nil/empty input stays nil"): an off-by-one on the guard
// (`len(items) == 0` flipped to `== -1` or `== 1`) would swap a nil result for a non-nil empty
// slice, which the round trip through the store cannot distinguish (marshalRows treats both as
// "nothing to store"), so only a direct unit test on the converters themselves can catch it.
func TestToDetailRowsAndToActionsReturnNilForEmptyInput(t *testing.T) {
	t.Parallel()

	if got := toDetailRows(nil); got != nil {
		t.Fatalf("toDetailRows(nil) = %#v, want nil", got)
	}
	if got := toActions(nil); got != nil {
		t.Fatalf("toActions(nil) = %#v, want nil", got)
	}
}
