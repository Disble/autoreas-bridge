package notification

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeAdapter struct {
	name     string
	err      error
	calls    *[]string
	received *[]Notification
}

func (f *fakeAdapter) Deliver(ctx context.Context, delivery Delivery) error {
	n := delivery.Notification
	if f.calls != nil {
		*f.calls = append(*f.calls, f.name)
	}
	if f.received != nil {
		*f.received = append(*f.received, n)
	}
	return f.err
}

// sampleNotification returns a representative notification for dispatcher tests.
func sampleNotification() Notification {
	return Notification{
		Title:         "Download complete",
		Body:          "3 episodes downloaded",
		Level:         LevelSuccess,
		Source:        "download",
		CorrelationID: "run-1",
		Timestamp:     time.Now(),
	}
}

func TestDispatcherInvokesAllRegisteredAdaptersInOrder(t *testing.T) {
	t.Parallel()

	var calls []string
	a := &fakeAdapter{name: "a", calls: &calls}
	b := &fakeAdapter{name: "b", calls: &calls}

	d := NewDispatcher(a, b)

	if err := d.Notify(context.Background(), sampleNotification()); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if len(calls) != 2 || calls[0] != "a" || calls[1] != "b" {
		t.Fatalf("expected both adapters invoked in order, got %v", calls)
	}
}

func TestDispatcherOneAdapterFailingDoesNotBlockTheOther(t *testing.T) {
	t.Parallel()

	var calls []string
	failing := &fakeAdapter{name: "failing", calls: &calls, err: errors.New("ui adapter boom")}
	healthy := &fakeAdapter{name: "healthy", calls: &calls}

	d := NewDispatcher(failing, healthy)

	if err := d.Notify(context.Background(), sampleNotification()); err == nil {
		t.Fatal("expected dispatcher to report the adapter failure for observability")
	}

	if len(calls) != 2 || calls[0] != "failing" || calls[1] != "healthy" {
		t.Fatalf("expected the healthy adapter to still run after the failing one, got %v", calls)
	}
}

func TestDispatcherAdapterFailureDoesNotFailTheCallerPath(t *testing.T) {
	t.Parallel()

	failing := &fakeAdapter{name: "failing", err: errors.New("desktop adapter boom")}
	d := NewDispatcher(failing)

	err := d.Notify(context.Background(), sampleNotification())
	if err == nil {
		t.Fatal("expected the dispatcher to surface the failure for logging purposes")
	}

	// The caller (a feature) is expected to ignore/log this return value rather than
	// treat it as a feature-level failure -- the contract is that Notify never panics
	// and always attempts every adapter, which is what we assert here.
	if _, ok := err.(interface{ Unwrap() []error }); !ok {
		t.Fatalf("expected an aggregate error supporting Unwrap() []error, got %T", err)
	}
}

func TestDispatcherNoAdaptersIsASuccessfulNoOp(t *testing.T) {
	t.Parallel()

	d := NewDispatcher()

	if err := d.Notify(context.Background(), sampleNotification()); err != nil {
		t.Fatalf("expected no-op success with zero adapters, got %v", err)
	}
}

func TestDispatcherAllAdaptersFailingStillAttemptsAll(t *testing.T) {
	t.Parallel()

	var calls []string
	a := &fakeAdapter{name: "a", calls: &calls, err: errors.New("a failed")}
	b := &fakeAdapter{name: "b", calls: &calls, err: errors.New("b failed")}
	c := &fakeAdapter{name: "c", calls: &calls, err: errors.New("c failed")}

	d := NewDispatcher(a, b, c)

	if err := d.Notify(context.Background(), sampleNotification()); err == nil {
		t.Fatal("expected an aggregate error when all adapters fail")
	}

	if len(calls) != 3 {
		t.Fatalf("expected all 3 adapters to be attempted, got %v", calls)
	}
}

var _ Adapter = (*fakeAdapter)(nil)
