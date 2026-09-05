package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/notification/center"
)

// TestClipboardCopyIntentIsRegisteredOnlyWhenClipboardIsAvailable follows Decision C: an unwired
// subsystem surfaces as intent_unregistered rather than as a handler that silently does nothing.
func TestClipboardCopyIntentIsRegisteredOnlyWhenClipboardIsAvailable(t *testing.T) {
	t.Parallel()

	absent := &App{}
	if _, found := absent.registerNotificationIntents().Resolve("clipboard.copy"); found {
		t.Fatal("expected clipboard.copy to be absent without a clipboard writer")
	}

	present := &App{copyText: func(context.Context, string) error { return nil }}
	if _, found := present.registerNotificationIntents().Resolve("clipboard.copy"); !found {
		t.Fatal("expected clipboard.copy to be registered once a clipboard writer exists")
	}
}

// TestClipboardCopyIntentWritesTheFrozenLinkToTheClipboard is the point of the whole PendingIntent
// model: the hoster URL was frozen into the action's Args when the notification was WRITTEN, and
// the handler copies exactly that. It never re-derives the link at press time -- the run that
// produced it is long over, and a re-derived link would be a different link.
func TestClipboardCopyIntentWritesTheFrozenLinkToTheClipboard(t *testing.T) {
	t.Parallel()

	var copied []string
	app := &App{copyText: func(_ context.Context, value string) error {
		copied = append(copied, value)
		return nil
	}}

	handler, found := app.registerNotificationIntents().Resolve("clipboard.copy")
	if !found {
		t.Fatal("expected clipboard.copy to be registered")
	}
	if err := handler.Execute(context.Background(), map[string]string{"text": "https://hoster.example/ep7"}); err != nil {
		t.Fatalf("Execute returned %v, want nil", err)
	}

	if len(copied) != 1 || copied[0] != "https://hoster.example/ep7" {
		t.Fatalf("clipboard received %#v, want exactly the frozen link", copied)
	}
}

// TestClipboardCopyIntentIsRepeatable pins that copying a hoster link may be pressed more than
// once.
//
// This test previously asserted the OPPOSITE, and said so plainly: the token stayed single-fire
// only because `center.Executor` refused on `action.ExecutedAtMS != 0` before resolving a handler
// and never called `Repeatable()` at all, so declaring it repeatable would have asserted a
// property nothing honoured. It pinned what the code did rather than what copying wants, and
// named its own exit -- "changing it means changing the Executor first".
//
// The Executor now consults `Repeatable()`, so the workaround is gone and this pins the real
// requirement instead: copying leaves nothing behind to spend, and a button that grays out after
// one press fails the user the moment they paste elsewhere and want it again.
func TestClipboardCopyIntentIsRepeatable(t *testing.T) {
	t.Parallel()

	app := &App{copyText: func(context.Context, string) error { return nil }}
	handler, _ := app.registerNotificationIntents().Resolve("clipboard.copy")

	if !handler.Repeatable() {
		t.Fatal("expected the clipboard intent to be repeatable: copying is idempotent, so a second press must not refuse already_executed")
	}
}

// TestClipboardCopyIntentRefusesAnEmptyText maps a token with nothing to copy onto the closed
// refusal set, exactly as navigationOpenIntent does for a missing route, rather than writing an
// empty string over whatever the user already had on their clipboard.
func TestClipboardCopyIntentRefusesAnEmptyText(t *testing.T) {
	t.Parallel()

	called := false
	app := &App{copyText: func(context.Context, string) error {
		called = true
		return nil
	}}
	handler, _ := app.registerNotificationIntents().Resolve("clipboard.copy")

	err := handler.Execute(context.Background(), map[string]string{})

	if !errors.Is(err, center.ErrTargetMissing) {
		t.Fatalf("Execute returned %v, want ErrTargetMissing", err)
	}
	if called {
		t.Fatal("expected an empty token never to reach the clipboard")
	}
}

// TestClipboardCopyIntentPropagatesAClipboardFailure pins that a clipboard the OS refused is
// reported, not swallowed: center.Executor maps a non-nil error onto target_missing, which is a
// refusal the row renders inline -- a silent nil would render as a successful copy that never
// happened.
func TestClipboardCopyIntentPropagatesAClipboardFailure(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("clipboard unavailable")
	app := &App{copyText: func(context.Context, string) error { return wantErr }}
	handler, _ := app.registerNotificationIntents().Resolve("clipboard.copy")

	if err := handler.Execute(context.Background(), map[string]string{"text": "https://hoster.example/ep7"}); !errors.Is(err, wantErr) {
		t.Fatalf("Execute returned %v, want the clipboard failure", err)
	}
}
