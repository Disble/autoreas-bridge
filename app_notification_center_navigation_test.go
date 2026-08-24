package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/notification/center"
)

// emitRecorder captures every Wails runtime event emitted through App.emitFn.
type emitRecorder struct {
	names   []string
	payload []any
}

// emit is the App.emitFn shape, recording the event name and its first payload argument.
func (r *emitRecorder) emit(_ context.Context, eventName string, optionalData ...interface{}) {
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
