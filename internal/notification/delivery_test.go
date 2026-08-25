package notification

import (
	"context"
	"testing"
)

// recordingDeliverer captures every Delivery it is handed, so a test asserts on the envelope an
// adapter would actually see rather than on the notification a producer wrote.
type recordingDeliverer struct {
	received []Delivery
}

func (r *recordingDeliverer) Deliver(_ context.Context, d Delivery) error {
	r.received = append(r.received, d)
	return nil
}

// TestDeliveryActionIDPairsWithTheActionAtTheSameIndex pins the invariant the whole envelope
// rests on: the ids are parallel to Notification.Actions, index for index.
func TestDeliveryActionIDPairsWithTheActionAtTheSameIndex(t *testing.T) {
	t.Parallel()

	delivery := Delivery{
		Notification: Notification{Actions: []ActionSpec{{Label: "first"}, {Label: "second"}}},
		ActionIDs:    []string{"act-1", "act-2"},
	}

	if got := delivery.ActionID(0); got != "act-1" {
		t.Fatalf("ActionID(0) = %q, want act-1", got)
	}
	if got := delivery.ActionID(1); got != "act-2" {
		t.Fatalf("ActionID(1) = %q, want act-2", got)
	}
}

// TestDeliveryActionIDIsEmptyWhenNothingPersistedIt covers the ordinary path on a machine whose
// bridge database will not open, and every test that wires a bare Dispatcher: the envelope
// carries no identity, and an adapter must read that as "not addressable" rather than crash.
func TestDeliveryActionIDIsEmptyWhenNothingPersistedIt(t *testing.T) {
	t.Parallel()

	delivery := Delivery{Notification: Notification{Actions: []ActionSpec{{Label: "first"}}}}

	if got := delivery.ActionID(0); got != "" {
		t.Fatalf("ActionID(0) = %q, want empty on an unpersisted delivery", got)
	}
}

// TestDeliveryActionIDIsEmptyOutOfRange: an index no action occupies addresses nothing, and
// answering with a neighbour's id would bind a button to the wrong verb.
func TestDeliveryActionIDIsEmptyOutOfRange(t *testing.T) {
	t.Parallel()

	delivery := Delivery{ActionIDs: []string{"act-1"}}

	for _, index := range []int{-1, 1, 99} {
		if got := delivery.ActionID(index); got != "" {
			t.Fatalf("ActionID(%d) = %q, want empty", index, got)
		}
	}
}

// TestDispatcherNotifyDeliversAnEnvelopeWithoutIdentity: Notify is the narrow producer-facing
// door, and a producer never knows an id. It must still reach every adapter.
func TestDispatcherNotifyDeliversAnEnvelopeWithoutIdentity(t *testing.T) {
	t.Parallel()

	var received []Notification
	adapter := &fakeAdapter{name: "a", received: &received}

	if err := NewDispatcher(adapter).Notify(context.Background(), sampleNotification()); err != nil {
		t.Fatalf("Notify: %v", err)
	}

	if len(received) != 1 {
		t.Fatalf("adapter received %d notifications, want 1", len(received))
	}
}

// TestDispatcherDeliverCarriesIdentityToEveryAdapter is the point of the envelope: the record id
// and the minted action ids reach the surfaces that have to address them.
func TestDispatcherDeliverCarriesIdentityToEveryAdapter(t *testing.T) {
	t.Parallel()

	var first, second []Delivery
	adapterA := &recordingAdapter{received: &first}
	adapterB := &recordingAdapter{received: &second}

	err := NewDispatcher(adapterA, adapterB).Deliver(context.Background(), Delivery{
		Notification: sampleNotification(),
		RecordID:     42,
		ActionIDs:    []string{"act-1"},
	})
	if err != nil {
		t.Fatalf("Deliver: %v", err)
	}

	for name, received := range map[string][]Delivery{"a": first, "b": second} {
		if len(received) != 1 {
			t.Fatalf("adapter %s received %d deliveries, want 1", name, len(received))
		}
		if received[0].RecordID != 42 {
			t.Fatalf("adapter %s got RecordID %d, want 42", name, received[0].RecordID)
		}
		if received[0].ActionID(0) != "act-1" {
			t.Fatalf("adapter %s got action id %q, want act-1", name, received[0].ActionID(0))
		}
	}
}

// TestDispatcherSatisfiesDelivererSoAWrapperCanHandItIdentity pins the seam center.Service uses:
// it holds a plain Notifier and reaches the wider door only when the value behind it offers one.
func TestDispatcherSatisfiesDelivererSoAWrapperCanHandItIdentity(t *testing.T) {
	t.Parallel()

	var notifier Notifier = NewDispatcher()

	if _, ok := notifier.(Deliverer); !ok {
		t.Fatal("a Dispatcher held as a Notifier is not a Deliverer, so no wrapper can hand it identity")
	}
}

// recordingAdapter captures the full envelope rather than only the notification inside it.
type recordingAdapter struct {
	received *[]Delivery
}

func (r *recordingAdapter) Deliver(_ context.Context, d Delivery) error {
	*r.received = append(*r.received, d)
	return nil
}

var (
	_ Adapter   = (*recordingAdapter)(nil)
	_ Deliverer = (*recordingDeliverer)(nil)
)
