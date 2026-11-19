package desktop

import (
	"testing"

	"autoreas-bridge/internal/notification"
)

// singleWholeNotificationAction returns the notification's one whole-notification token, failing
// unless there is exactly one and it is bound to no row: the token acts on the whole notification,
// even when the notification carries rows of its own.
func singleWholeNotificationAction(t *testing.T, sent notification.Notification) notification.ActionSpec {
	t.Helper()

	if len(sent.Actions) != 1 {
		t.Fatalf("actions = %#v, want exactly one whole-notification token", sent.Actions)
	}
	if sent.Actions[0].RowRef != "" {
		t.Fatalf("action = %#v, want it bound to no row", sent.Actions[0])
	}
	return sent.Actions[0]
}

// assertNavigatesTo fails unless the token opens the given route. Routes are written as literals
// so the assertion cannot pass against a rewritten route constant.
func assertNavigatesTo(t *testing.T, action notification.ActionSpec, label, route string) {
	t.Helper()

	if action.Label != label {
		t.Fatalf("action label = %q, want %q", action.Label, label)
	}
	if action.Intent != "navigation.open" {
		t.Fatalf("action intent = %q, want navigation.open", action.Intent)
	}
	if action.Args["route"] != route {
		t.Fatalf("frozen route = %q, want %q", action.Args["route"], route)
	}
}
