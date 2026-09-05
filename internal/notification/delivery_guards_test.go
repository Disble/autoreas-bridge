package notification

import (
	"context"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
)

// TestNilAdaptersDegradeRatherThanPanic covers the nil-receiver guard every adapter carries. They
// exist because a Dispatcher is assembled from optional subsystems, so a nil sink is an ordinary
// runtime state rather than a programming error -- and a panic here would take down the producer
// whose feature logic must never depend on a notification being delivered.
func TestNilAdaptersDegradeRatherThanPanic(t *testing.T) {
	t.Parallel()

	var (
		uiToast *UIToastAdapter
		logFwd  *logForwardAdapter
		desktop *DesktopToastAdapter
	)

	for name, adapter := range map[string]Adapter{"ui toast": uiToast, "log forward": logFwd, "desktop": desktop} {
		if err := adapter.Deliver(context.Background(), Delivery{Notification: sampleNotification()}); err != nil {
			t.Fatalf("nil %s adapter returned %v, want a silent no-op", name, err)
		}
	}
}

// TestNilDispatcherDegradesRatherThanPanic is the same guard one level up.
func TestNilDispatcherDegradesRatherThanPanic(t *testing.T) {
	t.Parallel()

	var dispatcher *Dispatcher

	if err := dispatcher.Deliver(context.Background(), Delivery{Notification: sampleNotification()}); err != nil {
		t.Fatalf("nil dispatcher returned %v, want a silent no-op", err)
	}
}

// TestANilAdapterIsSkippedWithoutStoppingTheFanOut is the failure-isolation promise applied to a
// hole rather than an error. Every adapter after a nil one must still be attempted -- skipping the
// rest would silently drop the Windows toast because the log forwarder happened to be unwired.
func TestANilAdapterIsSkippedWithoutStoppingTheFanOut(t *testing.T) {
	t.Parallel()

	var calls []string
	first := &fakeAdapter{name: "first", calls: &calls}
	last := &fakeAdapter{name: "last", calls: &calls}

	err := NewDispatcher(first, nil, last).Deliver(context.Background(), Delivery{Notification: sampleNotification()})
	if err != nil {
		t.Fatalf("Deliver: %v", err)
	}

	if len(calls) != 2 || calls[0] != "first" || calls[1] != "last" {
		t.Fatalf("adapters attempted = %#v, want both sides of the nil one", calls)
	}
}

// recordingLogger captures the one Logf the forward adapter makes.
type recordingLogger struct {
	messages []string
}

func (r *recordingLogger) Logf(_, _ string, _ sharedlogger.Fields, format string, args ...any) {
	r.messages = append(r.messages, sprintfLike(format, args...))
}

func (r *recordingLogger) Errorf(string, string, ...any) {}
func (r *recordingLogger) Warnf(string, string, ...any)  {}
func (r *recordingLogger) Infof(string, string, ...any)  {}
func (r *recordingLogger) Debugf(string, string, ...any) {}

// TestForwardedLogMessageNamesWhateverTheNotificationHas pins all three branches of the message
// builder. Each one drops a separator that would otherwise render as a stray ": " on a
// notification carrying only half of the pair.
func TestForwardedLogMessageNamesWhateverTheNotificationHas(t *testing.T) {
	t.Parallel()

	for name, testCase := range map[string]struct {
		notification Notification
		want         string
	}{
		"both":       {notification: Notification{Title: "Run completed", Body: "1 episode."}, want: "Run completed: 1 episode."},
		"title only": {notification: Notification{Title: "Run completed"}, want: "Run completed"},
		"body only":  {notification: Notification{Body: "1 episode."}, want: "1 episode."},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			logger := &recordingLogger{}
			if err := NewLogForwardAdapter(logger).Deliver(context.Background(), Delivery{Notification: testCase.notification}); err != nil {
				t.Fatalf("Deliver: %v", err)
			}

			if len(logger.messages) != 1 || logger.messages[0] != testCase.want {
				t.Fatalf("forwarded messages = %#v, want [%q]", logger.messages, testCase.want)
			}
		})
	}
}

// sprintfLike renders the adapter's "%s" call without importing fmt into the assertion, so the
// expected strings above stay literals rather than being derived from the production format.
func sprintfLike(format string, args ...any) string {
	if format != "%s" || len(args) != 1 {
		return format
	}
	message, _ := args[0].(string)
	return message
}
