package desktop

import (
	"context"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/notification/center"
	bridgeSync "autoreas-bridge/internal/sync"
)

// notificationModuleApp returns an App over a fresh bootstrapped bridge database whose
// notifications module is wired through the production executor step and moved to state.
func notificationModuleApp(t *testing.T, state lifecycle.State) *App {
	t.Helper()
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	app := &App{bridgeDB: db, notificationCenterStore: center.NewStore(db, center.StoreConfig{})}
	app.wireNotificationCenterIntentExecutor()
	return inModuleState(app, moduleNotifications, state)
}

// notificationBinding is one notifications binding: the call reports whether the answer is the
// one a ready module serves over an empty database.
type notificationBinding struct {
	name string
	call func(*App) (bool, error)
}

// notificationStoreBindings are the bindings that read or write the center store.
var notificationStoreBindings = []notificationBinding{
	{"ListNotifications", func(a *App) (bool, error) {
		got, err := a.ListNotifications(contracts.NotificationListRequest{Limit: 10})
		return got.Items != nil && len(got.Items) == 0 && got.TotalEver == 0, err
	}},
	{"GetNotification", func(a *App) (bool, error) {
		got, err := a.GetNotification(1)
		return !got.Found, err
	}},
	{"GetUnreadNotificationCount", func(a *App) (bool, error) {
		got, err := a.GetUnreadNotificationCount()
		return got == 0, err
	}},
	{"MarkNotificationsRead", func(a *App) (bool, error) {
		got, err := a.MarkNotificationsRead([]int64{1})
		return got == contracts.NotificationMutationResult{}, err
	}},
	{"MarkNotificationsUnread", func(a *App) (bool, error) {
		got, err := a.MarkNotificationsUnread([]int64{1})
		return got == contracts.NotificationMutationResult{}, err
	}},
	{"ArchiveNotifications", func(a *App) (bool, error) {
		got, err := a.ArchiveNotifications([]int64{1})
		return got == contracts.NotificationMutationResult{}, err
	}},
	{"RestoreNotifications", func(a *App) (bool, error) {
		got, err := a.RestoreNotifications([]int64{1})
		return got == contracts.NotificationMutationResult{}, err
	}},
}

// notificationBindings are every notifications binding, the action press included: an unknown
// record is refused as an outcome, never as an error.
var notificationBindings = append(notificationStoreBindings[:len(notificationStoreBindings):len(notificationStoreBindings)],
	notificationBinding{"ExecuteNotificationAction", func(a *App) (bool, error) {
		got, err := a.ExecuteNotificationAction(1, "act-missing")
		return !got.Executed && got.Reason != "", err
	}},
)

// TestNotificationBindingsFollowTheirModule pins S1 for the notification center: no binding answers
// an empty page, a zero count or a degraded envelope while its module starts or after it failed.
func TestNotificationBindingsFollowTheirModule(t *testing.T) {
	t.Parallel()
	for _, binding := range notificationBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			app := notificationModuleApp(t, lifecycle.StateStarting)
			assertStartingThenFailed(t, app, moduleNotifications, "notifications is starting", binding.call)
		})
		t.Run(binding.name+"/ready answers the value", func(t *testing.T) {
			t.Parallel()
			served, err := binding.call(notificationModuleApp(t, lifecycle.StateReady))
			assertModuleAnswer(t, served, err, "", "")
		})
	}
}

// TestNotificationStoreFailuresAreInternal pins that a failing store read or write reaches the
// frontend as an internal failure, never as an empty page, a zero count or a degraded envelope.
func TestNotificationStoreFailuresAreInternal(t *testing.T) {
	t.Parallel()
	for _, binding := range notificationStoreBindings {
		t.Run(binding.name, func(t *testing.T) {
			t.Parallel()
			app := notificationModuleApp(t, lifecycle.StateReady)
			if err := app.bridgeDB.Close(); err != nil {
				t.Fatalf("close db: %v", err)
			}

			_, err := binding.call(app)

			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal {
				t.Fatalf("err = %v (code %q), want internal", err, code)
			}
		})
	}
}

// TestNotificationMutationFailsWhenTheUnreadCountCannotBeRead pins the second step of every
// lifecycle mutation: a committed change whose fresh unread count cannot be read is the binding's
// error, never an envelope carrying a placeholder count the rail badge would show.
func TestNotificationMutationFailsWhenTheUnreadCountCannotBeRead(t *testing.T) {
	t.Parallel()
	app := notificationModuleApp(t, lifecycle.StateReady)
	if err := app.bridgeDB.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	got, err := notificationMutationResult(app.notificationCenterCtx(), app.notificationCenterStore, 1, nil)

	if err == nil || got != (contracts.NotificationMutationResult{}) {
		t.Fatalf("notificationMutationResult = %#v, %v; want no envelope and the count failure", got, err)
	}
}

// TestArchiveNotificationsFailureEmitsNoArchivedEvent pins that the archived event follows only a
// committed archive: a failed one archived nothing, so no toast may close over it.
func TestArchiveNotificationsFailureEmitsNoArchivedEvent(t *testing.T) {
	t.Parallel()
	app := notificationModuleApp(t, lifecycle.StateReady)
	emitted := 0
	app.emitFn = func(context.Context, string, ...any) { emitted++ }
	if err := app.bridgeDB.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	if _, err := app.ArchiveNotifications([]int64{1}); err == nil {
		t.Fatal("ArchiveNotifications over a closed database succeeded; want its failure")
	}
	if emitted != 0 {
		t.Fatalf("emitted %d archived events for a failed archive; want none", emitted)
	}
}
