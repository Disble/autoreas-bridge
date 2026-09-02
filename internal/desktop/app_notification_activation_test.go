package desktop

import (
	"context"
	"testing"

	"autoreas-bridge/internal/notification"
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
