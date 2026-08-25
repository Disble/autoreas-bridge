package center

import (
	"context"
	"database/sql"
	"testing"

	"autoreas-bridge/internal/notification"
)

// spyDeliverer is a sink that offers the WIDER door: it satisfies both notification.Notifier and
// notification.Deliverer, which is what the real Dispatcher does.
type spyDeliverer struct {
	deliveries []notification.Delivery
	notifies   int
}

func (s *spyDeliverer) Notify(_ context.Context, _ notification.Notification) error {
	s.notifies++
	return nil
}

func (s *spyDeliverer) Deliver(_ context.Context, d notification.Delivery) error {
	s.deliveries = append(s.deliveries, d)
	return nil
}

// notifyOnlySink offers the narrow door alone -- a hand-written double, or a future sink that
// only ever wanted notifications.
type notifyOnlySink struct {
	notifies int
}

func (s *notifyOnlySink) Notify(_ context.Context, _ notification.Notification) error {
	s.notifies++
	return nil
}

// notificationWithOneAction is the fixture every case below persists: one record carrying one
// whole-notification verb, which is the smallest thing that has an id worth passing on.
func notificationWithOneAction() notification.Notification {
	return notification.Notification{
		Title:  "Download run completed",
		Body:   "1 episode(s) downloaded.",
		Level:  notification.LevelSuccess,
		Source: "download",
		Kind:   "run_completed",
		Actions: []notification.ActionSpec{
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
		},
	}
}

// TestServiceHandsTheDelivererWhatItJustPersisted is the whole point of the envelope. The record
// id and the minted action ids existed all along -- InsertRecord returned one and toActions
// minted the others -- and were discarded a line later, leaving every adapter structurally unable
// to address a token (ADR-016).
func TestServiceHandsTheDelivererWhatItJustPersisted(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	sink := &spyDeliverer{}
	svc := Wrap(sink, NewStore(db, StoreConfig{}))

	if err := svc.Notify(context.Background(), notificationWithOneAction()); err != nil {
		t.Fatalf("Notify: %v", err)
	}

	if len(sink.deliveries) != 1 {
		t.Fatalf("sink received %d deliveries, want 1", len(sink.deliveries))
	}
	delivered := sink.deliveries[0]
	if delivered.RecordID <= 0 {
		t.Fatalf("delivered RecordID = %d, want the id the insert returned", delivered.RecordID)
	}
	if delivered.ActionID(0) == "" {
		t.Fatal("the delivered action carries no id, so no adapter can address it")
	}
	if sink.notifies != 0 {
		t.Fatal("the wider door was available and the narrow one was used anyway")
	}
}

// TestServiceDeliversTheProducersNotificationUnchanged guards the envelope from becoming a place
// to quietly rewrite content: only identity is added.
func TestServiceDeliversTheProducersNotificationUnchanged(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	sink := &spyDeliverer{}
	want := notificationWithOneAction()

	if err := Wrap(sink, NewStore(db, StoreConfig{})).Notify(context.Background(), want); err != nil {
		t.Fatalf("Notify: %v", err)
	}

	got := sink.deliveries[0].Notification
	if got.Title != want.Title || got.Kind != want.Kind || len(got.Actions) != len(want.Actions) {
		t.Fatalf("delivered notification = %#v, want the producer's own %#v", got, want)
	}
}

// TestServiceFallsBackToNotifyForASinkWithoutTheWiderDoor: the port stays narrow, and a sink that
// only implements Notifier must still receive everything it always did.
func TestServiceFallsBackToNotifyForASinkWithoutTheWiderDoor(t *testing.T) {
	t.Parallel()

	db := openBootstrappedTestDB(t)
	sink := &notifyOnlySink{}

	if err := Wrap(sink, NewStore(db, StoreConfig{})).Notify(context.Background(), notificationWithOneAction()); err != nil {
		t.Fatalf("Notify: %v", err)
	}

	if sink.notifies != 1 {
		t.Fatalf("narrow sink received %d notifies, want 1", sink.notifies)
	}
}

// TestServiceStillDeliversWhenThePersistFailed is R-1 restated for the envelope: five of the six
// producer families discard Notify's error, so skipping projection would silently downgrade a
// user-visible toast to nothing. The delivery still goes out -- carrying no identity, which is
// the honest answer when nothing was written.
func TestServiceStillDeliversWhenThePersistFailed(t *testing.T) {
	t.Parallel()

	sink := &spyDeliverer{}
	// A bare, unopened DB: InsertRecord recovers from its panic and reports an error.
	svc := Wrap(sink, NewStore(&sql.DB{}, StoreConfig{}))

	_ = svc.Notify(context.Background(), notificationWithOneAction())

	if len(sink.deliveries) != 1 {
		t.Fatalf("sink received %d deliveries, want the projection to survive a failed persist", len(sink.deliveries))
	}
	if sink.deliveries[0].RecordID != 0 {
		t.Fatalf("delivered RecordID = %d, want 0 when nothing was persisted", sink.deliveries[0].RecordID)
	}
	if sink.deliveries[0].ActionID(0) != "" {
		t.Fatal("an unpersisted delivery carries an action id, which addresses a token that does not exist")
	}
}

var (
	_ notification.Notifier  = (*spyDeliverer)(nil)
	_ notification.Deliverer = (*spyDeliverer)(nil)
	_ notification.Notifier  = (*notifyOnlySink)(nil)
)
