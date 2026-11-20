package center

import (
	"context"
	"errors"
	"testing"
)

// TestExecuteReportsWhereThePressLeavesTheUser pins that a press reports the activation its
// handler declares, on success and on a refusal the handler itself produced.
//
// A Windows toast press cannot see the screen it lands on, so the result is the only place the
// press learns whether to bring the app forward. A refused open-app press still opens the app:
// the user asked to look at something, and a hidden window would hide the refusal as well.
func TestExecuteReportsWhereThePressLeavesTheUser(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		handler IntentHandler
		want    Activation
		ran     bool
	}{
		"background operation": {handler: SingleFireFunc(func(context.Context, map[string]string) error { return nil }), want: ActivationBackground, ran: true},
		"open-app navigation":  {handler: OpensApp(RepeatableFunc(func(context.Context, map[string]string) error { return nil })), want: ActivationOpenApp, ran: true},
		"open-app press whose target is gone": {
			handler: OpensApp(RepeatableFunc(func(context.Context, map[string]string) error { return ErrTargetMissing })),
			want:    ActivationOpenApp,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			executor, _, recordID := newRepeatableTestExecutor(t, true, tc.handler)

			result := executor.Execute(context.Background(), recordID, "act-1")

			if result.Executed != tc.ran {
				t.Fatalf("Executed = %v, want %v (%#v)", result.Executed, tc.ran, result)
			}
			if result.Activation != tc.want {
				t.Fatalf("Activation = %q, want %q", result.Activation, tc.want)
			}
		})
	}
}

// TestExecuteReportsNoActivationWhenNoHandlerAnswered pins the refusals that happen before or
// without a handler: nothing declared where the press leads, so the result claims nothing.
func TestExecuteReportsNoActivationWhenNoHandlerAnswered(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		registered bool
		offset     int64
		reason     RefusalReason
	}{
		"foreign action":      {registered: true, offset: 1, reason: RefusalForeignAction},
		"unregistered intent": {registered: false, reason: RefusalIntentUnregistered},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			handler := OpensApp(RepeatableFunc(func(context.Context, map[string]string) error { return nil }))
			executor, _, recordID := newRepeatableTestExecutor(t, tc.registered, handler)

			result := executor.Execute(context.Background(), recordID+tc.offset, "act-1")

			if result.Reason != tc.reason {
				t.Fatalf("Reason = %q, want %q", result.Reason, tc.reason)
			}
			if result.Activation != "" {
				t.Fatalf("Activation = %q, want none", result.Activation)
			}
		})
	}
}

// TestOpensAppChangesOnlyTheActivation pins that marking a handler open-app keeps what it runs
// and whether it may run twice.
func TestOpensAppChangesOnlyTheActivation(t *testing.T) {
	t.Parallel()

	errBoom := errors.New("boom")
	var calls int
	run := func(context.Context, map[string]string) error {
		calls++
		return errBoom
	}

	repeatable := OpensApp(RepeatableFunc(run))
	single := OpensApp(SingleFireFunc(run))

	if err := repeatable.Execute(context.Background(), nil); !errors.Is(err, errBoom) || calls != 1 {
		t.Fatalf("Execute = %v after %d calls, want the wrapped handler's error after one call", err, calls)
	}
	if !repeatable.Repeatable() || single.Repeatable() {
		t.Fatalf("Repeatable = %v/%v, want the wrapped handlers' own answers true/false", repeatable.Repeatable(), single.Repeatable())
	}
	if repeatable.Activation() != ActivationOpenApp || single.Activation() != ActivationOpenApp {
		t.Fatal("expected OpensApp to declare an open-app activation")
	}
	if RepeatableFunc(run).Activation() != ActivationBackground || SingleFireFunc(run).Activation() != ActivationBackground {
		t.Fatal("expected a plain handler to run in the background")
	}
}
