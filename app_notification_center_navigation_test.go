package main

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/notification/center"
)

// emitRecorder captures every Wails runtime event emitted through App.emitFn.
type emitRecorder struct {
	names   []string
	payload []any
}

// emit is the App.emitFn shape, recording the event name and its first payload argument.
func (r *emitRecorder) emit(_ context.Context, eventName string, optionalData ...any) {
	r.names = append(r.names, eventName)
	if len(optionalData) > 0 {
		r.payload = append(r.payload, optionalData[0])
		return
	}
	r.payload = append(r.payload, nil)
}

// TestRegisterNotificationIntentsNavigationOpenConditionalOnEmitFn asserts navigation.open is
// registered only when the runtime emit channel it needs actually exists (design Decision C: an
// unwired subsystem surfaces as intent_unregistered, never as an unmodelled fifth refusal).
func TestRegisterNotificationIntentsNavigationOpenConditionalOnEmitFn(t *testing.T) {
	t.Parallel()

	absent := &App{}
	if _, found := absent.registerNotificationIntents().Resolve(center.IntentNavigationOpen); found {
		t.Fatal("expected navigation.open absent when emitFn is nil")
	}

	recorder := &emitRecorder{}
	present := &App{emitFn: recorder.emit}
	if _, found := present.registerNotificationIntents().Resolve(center.IntentNavigationOpen); !found {
		t.Fatal("expected navigation.open present when emitFn is wired")
	}
}

// TestNavigationOpenIntentEmitsTheFrozenRouteToTheFrontend asserts pressing an "Open Downloads"
// token reaches the frontend as a runtime event carrying the route frozen into the action's args
// at creation, mirroring how ArchiveNotifications reaches the toast layer.
func TestNavigationOpenIntentEmitsTheFrozenRouteToTheFrontend(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	app := &App{ctx: context.Background(), emitFn: recorder.emit}

	handler, found := app.registerNotificationIntents().Resolve(center.IntentNavigationOpen)
	if !found {
		t.Fatal("expected navigation.open to be registered when emitFn is wired")
	}
	if err := handler.Execute(context.Background(), map[string]string{"route": "/downloads"}); err != nil {
		t.Fatalf("expected the navigation token to resolve, got %v", err)
	}

	if len(recorder.names) != 1 {
		t.Fatalf("emitted %#v, want exactly one runtime event", recorder.names)
	}
	if recorder.names[0] != "notification.navigate" {
		t.Fatalf("emitted event name = %q, want %q", recorder.names[0], "notification.navigate")
	}
	if recorder.payload[0] != "/downloads" {
		t.Fatalf("emitted payload = %#v, want the frozen route %q", recorder.payload[0], "/downloads")
	}
}

// TestNavigationOpenIntentRefusesAnEmptyRouteWithoutEmitting pins the handler's only failure
// mode onto the closed refusal set: a token whose frozen route is missing is a missing target,
// and it must never emit a navigation event to nowhere.
func TestNavigationOpenIntentRefusesAnEmptyRouteWithoutEmitting(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	app := &App{ctx: context.Background(), emitFn: recorder.emit}

	handler, _ := app.registerNotificationIntents().Resolve(center.IntentNavigationOpen)
	err := handler.Execute(context.Background(), map[string]string{})

	if !errors.Is(err, center.ErrTargetMissing) {
		t.Fatalf("Execute with no route = %v, want ErrTargetMissing", err)
	}
	if len(recorder.names) != 0 {
		t.Fatalf("emitted %#v, want nothing emitted for a route-less token", recorder.names)
	}
}

// TestRegisterNotificationIntentsRegistersExactlyTheKnownIntentKeys pins the intent vocabulary
// as LITERALS, resolved against the live registry. Every other test here addresses an intent
// through the same constant the registry registered it under, so both sides of the comparison
// move together and a rename is invisible to them. It is not invisible in production: an intent
// key is a persisted string, so a record written last week holds the old spelling and every one
// of its action tokens would silently stop resolving.
func TestRegisterNotificationIntentsRegistersExactlyTheKnownIntentKeys(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	app := &App{
		downloadService:   download.NewService(download.ServiceDeps{}),
		downloadScheduler: &fakeAppScheduler{},
		emitFn:            recorder.emit,
	}

	keys := app.registerNotificationIntents().Keys()

	want := []string{"download.run_anime", "navigation.open", "schedule.ignore_missed", "schedule.run_missed_now"}
	if !reflect.DeepEqual(keys, want) {
		t.Fatalf("registered intent keys = %#v, want exactly %#v (sorted)", keys, want)
	}
}

// TestNavigationOpenIntentIsRepeatable pins that opening a route may be pressed more than once.
//
// Navigating is idempotent in exactly the sense copying to the clipboard is: the press leaves
// nothing behind to spend, so a second one costs what the first did. Registered single-fire, the
// token was spent by its own first press and refused already_executed on every press after --
// permanently dead on that record, and (until the frontend grew a listener for the event this
// handler emits) dead having never navigated even once.
func TestNavigationOpenIntentIsRepeatable(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	app := &App{emitFn: recorder.emit}

	handler, found := app.registerNotificationIntents().Resolve(center.IntentNavigationOpen)

	if !found {
		t.Fatal("expected navigation.open to be registered when emitFn is wired")
	}
	if !handler.Repeatable() {
		t.Fatal("expected navigation.open to be repeatable: navigating leaves nothing behind to spend, so a second press must not refuse already_executed")
	}
}

// TestGetNotificationReportsWhetherAnActionMayBePressedAgain pins repeatability onto the wire.
//
// Registering navigation.open as repeatable fixes only the half of the second press that the
// Executor owns. The pane that draws the button decides separately whether to offer one, and it
// disables an action the moment executedAtMs is set -- which Executor.Execute stamps for
// repeatable and single-fire presses alike. Without this field the backend's repeatability is
// unreachable: the button grays out on the first press and the second one never leaves the
// frontend, so a Go-only fix would have tested green against a still-dead button.
func TestGetNotificationReportsWhetherAnActionMayBePressedAgain(t *testing.T) {
	t.Parallel()

	app := notificationCenterAppTestDB(t)
	app.emitFn = (&emitRecorder{}).emit
	app.downloadService = download.NewService(download.ServiceDeps{})
	app.wireNotificationCenterIntentExecutor()

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000, Title: "Download run finished", Body: "two of three completed",
		Level: "warning", Source: "download",
		Actions: []center.Action{
			{ID: "act-open", Label: "Open Downloads", Intent: center.IntentNavigationOpen, Args: map[string]string{center.ArgKeyRoute: "/downloads"}},
			{ID: "act-run", RowRef: "a-4417", Ordinal: 1, Label: "Run this anime again", Intent: center.IntentDownloadRunAnime, Args: map[string]string{center.ArgKeyAnimeID: "a-4417"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	detail := app.GetNotification(id)

	wire := make(map[string]contracts.NotificationAction, len(detail.Item.Actions))
	for _, action := range detail.Item.Actions {
		wire[action.ID] = action
	}
	if !wire["act-open"].Repeatable {
		t.Fatal("expected the navigation action to reach the wire as repeatable, so the pane keeps its button pressable")
	}
	if wire["act-run"].Repeatable {
		t.Fatal("expected the re-run action to reach the wire as single-fire: a second press would start a second download")
	}
}

// TestGetNotificationReportsUnregisteredIntentsAsSingleFire pins the degraded case. Repeatability
// is a property of a REGISTERED handler, so a token whose subsystem is unwired -- the state
// Decision C models as intent_unregistered -- must not reach the wire claiming a second press
// would work, when in fact no press works at all.
func TestGetNotificationReportsUnregisteredIntentsAsSingleFire(t *testing.T) {
	t.Parallel()

	app := notificationCenterAppTestDB(t)
	app.wireNotificationCenterIntentExecutor() // No emitFn: navigation.open registers nothing.

	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000, Title: "Download run finished", Body: "b", Level: "warning", Source: "download",
		Actions: []center.Action{
			{ID: "act-open", Label: "Open Downloads", Intent: center.IntentNavigationOpen, Args: map[string]string{center.ArgKeyRoute: "/downloads"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	detail := app.GetNotification(id)

	if len(detail.Item.Actions) != 1 {
		t.Fatalf("wire actions = %#v, want exactly one", detail.Item.Actions)
	}
	if detail.Item.Actions[0].Repeatable {
		t.Fatal("expected an unregistered intent to reach the wire as single-fire: no press resolves at all, so a repeatable button would promise a second one that cannot happen")
	}
}

// TestGetNotificationBeforeTheExecutorIsWiredReportsSingleFireWithoutPanicking pins the
// nil-registry branch of isRepeatableIntent.
//
// GetNotification is reachable before wireNotificationCenterIntentExecutor has run -- the
// executor is built only after startDownloadOrchestration (design §5.8) -- and
// center.StaticRegistry is a pointer whose Resolve dereferences it, so a record carrying any
// action at all would panic the binding instead of degrading, exactly where every other read
// here degrades to Degraded/empty.
//
// This test exists because hand-mutation found the guard unpinned: deleting it left every
// existing test green, since none of them read a record that HAS an action without wiring the
// executor first.
func TestGetNotificationBeforeTheExecutorIsWiredReportsSingleFireWithoutPanicking(t *testing.T) {
	t.Parallel()

	app := notificationCenterAppTestDB(t) // wireNotificationCenterIntentExecutor deliberately NOT called.
	id, err := app.notificationCenterStore.InsertRecord(app.notificationCenterCtx(), center.Record{
		CreatedAtMS: 1000, Title: "Download run finished", Body: "b", Level: "warning", Source: "download",
		Actions: []center.Action{
			{ID: "act-open", Label: "Open Downloads", Intent: center.IntentNavigationOpen, Args: map[string]string{center.ArgKeyRoute: "/downloads"}},
		},
	})
	if err != nil {
		t.Fatalf("insert record: %v", err)
	}

	detail := app.GetNotification(id)

	if !detail.Found || len(detail.Item.Actions) != 1 {
		t.Fatalf("GetNotification = %#v, want the record and its one action", detail)
	}
	if detail.Item.Actions[0].Repeatable {
		t.Fatal("expected single-fire before any registry exists: nothing is wired, so no press resolves at all")
	}
}
