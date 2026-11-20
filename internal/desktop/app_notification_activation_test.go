package desktop

import (
	"context"
	"fmt"
	"testing"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/season"
)

// TestDesktopActivationArgumentsAreOwnedByThisProgram is the security half of the second door.
// The activation callback is reachable from outside the process, so an argument this program did
// not write must be refused rather than parsed -- a press resolving to a record id we invented
// would act on a notification the user never saw.
func TestDesktopActivationArgumentsAreOwnedByThisProgram(t *testing.T) {
	t.Parallel()

	for name, argument := range map[string]string{
		"foreign scheme": "someoneelse:42:act-1",
		"not a record":   "autoreas-notification:abc:act-1",
		"empty":          "",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if _, _, ok := notification.DecodeActivation(argument); ok {
				t.Fatalf("argument %q was accepted", argument)
			}
		})
	}
}

// TestDesktopActivationRoutesABodyPressToTheRecord: a press carrying no action id is the toast
// body rather than one of its buttons, which asks to OPEN the record. Running an executor for it
// would fire whichever verb happened to be first.
func TestDesktopActivationRoutesABodyPressToTheRecord(t *testing.T) {
	t.Parallel()

	var emitted []string
	app := &App{emitFn: func(_ context.Context, _ string, optionalData ...any) {
		for _, datum := range optionalData {
			if route, ok := datum.(string); ok {
				emitted = append(emitted, route)
			}
		}
	}}

	app.navigateToNotificationRecord(42)

	if len(emitted) != 1 || emitted[0] != "/notifications?recordId=42" {
		t.Fatalf("emitted routes = %#v, want the record's own route", emitted)
	}
}

// activationPressApp is an App whose Windows toast presses reach a real store and executor, with
// observable window and clipboard seams.
type activationPressApp struct {
	*App
	recorder        *emitRecorder
	showCalls       int
	unminimiseCalls int
	copied          []string
	recordID        int64
}

// newActivationPressApp wires the executor the way startup does, minus the process-global
// Windows callback, and persists one record holding an open-app and a background action.
func newActivationPressApp(t *testing.T) *activationPressApp {
	t.Helper()

	app := &activationPressApp{App: notificationCenterAppTestDB(t), recorder: &emitRecorder{}}
	app.ctx = context.Background()
	app.emitFn = app.recorder.emit
	app.showWindow = func(context.Context) { app.showCalls++ }
	app.unminimiseWindow = func(context.Context) { app.unminimiseCalls++ }
	app.copyText = func(_ context.Context, value string) error {
		app.copied = append(app.copied, value)
		return nil
	}
	app.notificationCenterIntents = app.registerNotificationIntents()
	app.notificationCenterExecutor = center.NewExecutor(app.notificationCenterStore, app.notificationCenterIntents)
	app.moduleSet().notifications.Bind(notificationServices{store: app.notificationCenterStore, executor: app.notificationCenterExecutor})

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000, Title: "Download run finished", Body: "b", Level: "info", Source: "download",
		Actions: []center.Action{
			{ID: "act-open", Label: "Watch today", Intent: center.IntentNavigationOpen, Args: map[string]string{center.ArgKeyRoute: "/today"}},
			{ID: "act-copy", Ordinal: 1, Label: "Copy hoster 1", Intent: center.IntentClipboardCopy, Args: map[string]string{center.ArgKeyText: "https://hoster.example/1"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}
	app.recordID = id
	return app
}

// TestDesktopActivationOpenAppPressBringsTheWindowForward: Bridge starts hidden in the tray, so a
// toast button that navigates changed a page nobody could see. An open-app press navigates AND
// restores the window.
func TestDesktopActivationOpenAppPressBringsTheWindowForward(t *testing.T) {
	t.Parallel()
	app := newActivationPressApp(t)

	app.handleDesktopActivation(app.recordID, "act-open")

	if app.showCalls != 1 || app.unminimiseCalls != 1 {
		t.Fatalf("show/unminimise calls = %d/%d, want 1/1", app.showCalls, app.unminimiseCalls)
	}
	if len(app.recorder.payload) != 1 || app.recorder.payload[0] != "/today" {
		t.Fatalf("emitted %#v, want the frozen route /today", app.recorder.payload)
	}
}

// TestDesktopActivationBackgroundPressLeavesTheWindowAlone: a background action runs where it
// is, without pulling a hidden window over whatever the user is doing.
func TestDesktopActivationBackgroundPressLeavesTheWindowAlone(t *testing.T) {
	t.Parallel()
	app := newActivationPressApp(t)

	app.handleDesktopActivation(app.recordID, "act-copy")

	if len(app.copied) != 1 || app.copied[0] != "https://hoster.example/1" {
		t.Fatalf("copied %#v, want the frozen hoster link", app.copied)
	}
	if app.showCalls != 0 || app.unminimiseCalls != 0 {
		t.Fatalf("show/unminimise calls = %d/%d, want the window left alone", app.showCalls, app.unminimiseCalls)
	}
}

// TestDesktopActivationBodyPressOpensTheRecordInAVisibleWindow: pressing the toast itself asks
// to read the record, which only makes sense on screen.
func TestDesktopActivationBodyPressOpensTheRecordInAVisibleWindow(t *testing.T) {
	t.Parallel()
	app := newActivationPressApp(t)

	app.handleDesktopActivation(app.recordID, "")

	want := fmt.Sprintf("/notifications?recordId=%d", app.recordID)
	if len(app.recorder.payload) != 1 || app.recorder.payload[0] != want {
		t.Fatalf("emitted %#v, want %q", app.recorder.payload, want)
	}
	if app.showCalls != 1 || app.unminimiseCalls != 1 {
		t.Fatalf("show/unminimise calls = %d/%d, want 1/1", app.showCalls, app.unminimiseCalls)
	}
}

// TestRegisterNotificationIntentsDeclaresWhichPressesOpenTheApp pins the split as one table:
// navigating is the only intent that needs the window, and every operation runs in place.
func TestRegisterNotificationIntentsDeclaresWhichPressesOpenTheApp(t *testing.T) {
	t.Parallel()

	app := &App{
		downloadService:   download.NewService(download.ServiceDeps{}),
		downloadScheduler: &fakeAppScheduler{},
		emitFn:            (&emitRecorder{}).emit,
		copyText:          func(context.Context, string) error { return nil },
		seasonService:     &season.Service{},
	}
	registry := app.registerNotificationIntents()

	for intent, want := range map[string]center.Activation{
		center.IntentNavigationOpen:       center.ActivationOpenApp,
		center.IntentDownloadRunAnime:     center.ActivationBackground,
		center.IntentClipboardCopy:        center.ActivationBackground,
		center.IntentSeasonDownloadNow:    center.ActivationBackground,
		center.IntentScheduleRunMissedNow: center.ActivationBackground,
		center.IntentScheduleIgnoreMissed: center.ActivationBackground,
	} {
		handler, found := registry.Resolve(intent)
		if !found {
			t.Fatalf("intent %q is not registered", intent)
		}
		if got := handler.Activation(); got != want {
			t.Fatalf("intent %q activation = %q, want %q", intent, got, want)
		}
	}
}

// TestDesktopActivationBodyPressDegradesWithoutARuntime: the emit seam is nil in tests and before
// the Wails runtime exists, and a press then has nowhere to go. It must not panic on the way.
func TestDesktopActivationBodyPressDegradesWithoutARuntime(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("navigating with no runtime panicked: %v", r)
		}
	}()

	(&App{}).navigateToNotificationRecord(42)
}
