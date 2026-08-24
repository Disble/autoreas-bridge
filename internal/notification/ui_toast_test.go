package notification

import (
	"context"
	"reflect"
	"testing"
	"time"
)

type capturedEmit struct {
	ctx       context.Context
	eventName string
	data      []interface{}
}

func TestUIToastAdapterEmitsNotificationPushWithFullPayload(t *testing.T) {
	t.Parallel()

	var captured []capturedEmit
	emit := func(ctx context.Context, eventName string, optionalData ...interface{}) {
		captured = append(captured, capturedEmit{ctx: ctx, eventName: eventName, data: optionalData})
	}

	adapter := NewUIToastAdapter(emit)

	n := Notification{
		Title:         "Download complete",
		Body:          "3 episodes downloaded",
		Level:         LevelSuccess,
		Source:        "download",
		CorrelationID: "run-1",
		Timestamp:     time.Date(2026, 6, 21, 12, 0, 0, 0, time.UTC),
	}

	ctx := context.WithValue(context.Background(), struct{ key string }{key: "test"}, "value")
	if err := adapter.Deliver(ctx, n); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if len(captured) != 1 {
		t.Fatalf("expected exactly 1 emit call, got %d", len(captured))
	}

	got := captured[0]
	if got.eventName != "notification.push" {
		t.Fatalf("expected event name %q, got %q", "notification.push", got.eventName)
	}

	if len(got.data) != 1 {
		t.Fatalf("expected exactly 1 payload argument, got %d", len(got.data))
	}

	payload, ok := got.data[0].(Notification)
	if !ok {
		t.Fatalf("expected payload of type Notification, got %T", got.data[0])
	}

	// Rows/Actions are slices, so Notification is no longer comparable via == -- DeepEqual is the
	// direct replacement.
	if !reflect.DeepEqual(payload, n) {
		t.Fatalf("expected payload to carry the full Notification fields, got %+v want %+v", payload, n)
	}
}

func TestUIToastAdapterDegradesGracefullyWhenEmitIsNil(t *testing.T) {
	t.Parallel()

	adapter := NewUIToastAdapter(nil)

	err := adapter.Deliver(context.Background(), Notification{Title: "x", Level: LevelInfo})
	if err != nil {
		t.Fatalf("expected nil-emit degrade to be a no-op without error, got %v", err)
	}
}

var _ Adapter = (*UIToastAdapter)(nil)
