package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
)

func TestMemoryHubBroadcastsAnimeChangedToRegisteredClients(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4})
	t.Cleanup(func() { _ = hub.Close() })

	first := newRecordingClient("client-1")
	second := newRecordingClient("client-2")
	if err := hub.Register(context.Background(), first); err != nil {
		t.Fatalf("register first client: %v", err)
	}
	if err := hub.Register(context.Background(), second); err != nil {
		t.Fatalf("register second client: %v", err)
	}

	consumeControlMessage(t, first.Receive(t))
	consumeControlMessage(t, second.Receive(t))

	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{
		AnimeID: "anime-123",
		Payload: []byte(`{"nombre":"Bleach"}`),
	})

	assertAnimeChangedPayload(t, first.Receive(t), "anime-123")
	assertAnimeChangedPayload(t, second.Receive(t), "anime-123")
}

func TestMemoryHubUnregisterRemovesClientAndIsIdempotent(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 2, ClientBuffer: 2})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClient("client-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register client: %v", err)
	}

	consumeControlMessage(t, client.Receive(t))
	hub.Unregister(client.ID())
	hub.Unregister(client.ID())

	if got := hub.ClientCount(); got != 0 {
		t.Fatalf("expected client count 0, got %d", got)
	}
}

func TestMemoryHubBroadcastDoesNotBlockWithSlowClient(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 1, ClientBuffer: 1})
	t.Cleanup(func() { _ = hub.Close() })

	slow := newBlockingClient("slow-client")
	if err := hub.Register(context.Background(), slow); err != nil {
		t.Fatalf("register slow client: %v", err)
	}

	deadline := time.After(100 * time.Millisecond)
	done := make(chan struct{})
	go func() {
		hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-123"})
		close(done)
	}()

	select {
	case <-done:
	case <-deadline:
		t.Fatal("expected broadcast to return without blocking")
	}
}

func TestMemoryHubBroadcastsCreateAndDeleteEventTypes(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClient("client-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register client: %v", err)
	}
	consumeControlMessage(t, client.Receive(t))

	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-created", ChangeType: events.AnimeChangeTypeCreate})
	hub.BroadcastAnimeChanged(context.Background(), events.AnimeChangedEvent{AnimeID: "anime-deleted", ChangeType: events.AnimeChangeTypeDelete})

	assertAnimeIDPayload(t, client.Receive(t), MessageTypeAnimeCreated, "anime-created")
	assertAnimeIDPayload(t, client.Receive(t), MessageTypeAnimeDeleted, "anime-deleted")
}

type recordingClient struct {
	id       string
	received chan []byte
	closed   chan struct{}
}

func newRecordingClient(id string) *recordingClient {
	return &recordingClient{
		id:       id,
		received: make(chan []byte, 8),
		closed:   make(chan struct{}),
	}
}

func (c *recordingClient) ID() string {
	return c.id
}

func (c *recordingClient) Send(_ context.Context, payload []byte) error {
	copyPayload := append([]byte(nil), payload...)
	c.received <- copyPayload
	return nil
}

func (c *recordingClient) Close() error {
	select {
	case <-c.closed:
	default:
		close(c.closed)
	}
	return nil
}

func (c *recordingClient) Receive(t *testing.T) []byte {
	t.Helper()

	select {
	case payload := <-c.received:
		return payload
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected client to receive payload")
		return nil
	}
}

type blockingClient struct {
	id string
}

func newBlockingClient(id string) *blockingClient {
	return &blockingClient{id: id}
}

func (c *blockingClient) ID() string {
	return c.id
}

func (c *blockingClient) Send(ctx context.Context, _ []byte) error {
	<-ctx.Done()
	return ctx.Err()
}

func (*blockingClient) Close() error {
	return nil
}

func consumeControlMessage(t *testing.T, payload []byte) {
	t.Helper()

	var msg ControlMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("unmarshal control message: %v", err)
	}

	if msg.Type != MessageTypeSyncRequired {
		t.Fatalf("expected control type %q, got %q", MessageTypeSyncRequired, msg.Type)
	}
}

func assertAnimeChangedPayload(t *testing.T, payload []byte, wantAnimeID string) {
	t.Helper()

	var msg AnimeChangedMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("unmarshal anime changed message: %v", err)
	}

	if msg.Type != MessageTypeAnimeChanged {
		t.Fatalf("expected message type %q, got %q", MessageTypeAnimeChanged, msg.Type)
	}

	if msg.AnimeID != wantAnimeID {
		t.Fatalf("expected anime id %q, got %q", wantAnimeID, msg.AnimeID)
	}
}

func assertAnimeIDPayload(t *testing.T, payload []byte, wantType string, wantAnimeID string) {
	t.Helper()

	var msg AnimeIDMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("unmarshal anime id message: %v", err)
	}

	if msg.Type != wantType {
		t.Fatalf("expected message type %q, got %q", wantType, msg.Type)
	}
	if msg.AnimeID != wantAnimeID {
		t.Fatalf("expected anime id %q, got %q", wantAnimeID, msg.AnimeID)
	}
}
