package center

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/notification"

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
	if spy.calls[0] != want {
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
	if spy.calls[0] != want {
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
