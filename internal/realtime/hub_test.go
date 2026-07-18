package realtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

func TestMemoryHubBroadcastsAnimeChangedToRegisteredClients(t *testing.T) {
	t.Parallel()

	logger := &recordingRealtimeLogger{}
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 4, ClientBuffer: 4, Logger: logger})
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

	entries := logger.entries()
	if len(entries) == 0 || entries[0].Domain != "websocket" {
		t.Fatalf("expected websocket logs, got %#v", entries)
	}

	// Find broadcast log and verify it includes client count in metadata
	var broadcastEntry *sharedlogger.LogEntry
	for i, entry := range entries {
		if entry.EventType == "websocket.broadcast" {
			broadcastEntry = &entries[i]
			break
		}
	}
	if broadcastEntry == nil {
		t.Fatalf("expected log entry with EventType 'websocket.broadcast', got %#v", entries)
	}
	if broadcastEntry.EntityID != "anime-123" {
		t.Fatalf("expected broadcast EntityID 'anime-123', got %q", broadcastEntry.EntityID)
	}
	if broadcastEntry.Metadata == nil || broadcastEntry.Metadata["clientCount"] == nil {
		t.Fatalf("expected broadcast metadata to include clientCount, got %v", broadcastEntry.Metadata)
	}
}

func TestMemoryHubUnregisterRemovesClientAndIsIdempotent(t *testing.T) {
	t.Parallel()

	logger := &recordingRealtimeLogger{}
	hub := NewMemoryHub(context.Background(), MemoryHubConfig{BroadcastBuffer: 2, ClientBuffer: 2, Logger: logger})
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

	entries := logger.entries()
	var registerEntry *sharedlogger.LogEntry
	var unregisterEntry *sharedlogger.LogEntry
	for i, entry := range entries {
		switch entry.EventType {
		case "websocket.register":
			registerEntry = &entries[i]
		case "websocket.unregister":
			unregisterEntry = &entries[i]
		}
	}
	if registerEntry == nil {
		t.Fatalf("expected websocket.register log entry, got %#v", entries)
	}
	if registerEntry.EntityID != "client-1" {
		t.Fatalf("expected register EntityID 'client-1', got %q", registerEntry.EntityID)
	}
	if registerEntry.Metadata == nil || registerEntry.Metadata["clientCount"] == nil {
		t.Fatalf("expected register metadata clientCount, got %#v", registerEntry.Metadata)
	}
	if unregisterEntry == nil {
		t.Fatalf("expected websocket.unregister log entry, got %#v", entries)
	}
	if unregisterEntry.EntityID != "client-1" {
		t.Fatalf("expected unregister EntityID 'client-1', got %q", unregisterEntry.EntityID)
	}
	if unregisterEntry.Metadata == nil || unregisterEntry.Metadata["clientCount"] != 0 {
		t.Fatalf("expected unregister metadata clientCount=0, got %#v", unregisterEntry.Metadata)
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

func TestMemoryHubBroadcastsPreferencesChangedToRegisteredClients(t *testing.T) {
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

	hub.BroadcastPreferencesChanged(context.Background(), true)

	assertPreferencesChangedPayload(t, first.Receive(t), true)
	assertPreferencesChangedPayload(t, second.Receive(t), true)
}

type recordingClient struct {
	id       string
	received chan []byte
	closed   chan struct{}
}

// newRecordingClient creates a client that records delivered payloads.
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

type recordingRealtimeLogger struct {
	entriesList []sharedlogger.LogEntry
}

func (l *recordingRealtimeLogger) Debugf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelDebug})
}

func (l *recordingRealtimeLogger) Infof(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelInfo})
}

func (l *recordingRealtimeLogger) Warnf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelWarn})
}

func (l *recordingRealtimeLogger) Errorf(domain, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{Domain: domain, Level: sharedlogger.LevelError})
}

func (l *recordingRealtimeLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entriesList = append(l.entriesList, sharedlogger.LogEntry{
		Domain:        domain,
		Level:         level,
		CorrelationID: fields.CorrelationID,
		EntityID:      fields.EntityID,
		EventType:     fields.EventType,
		DurationMs:    fields.DurationMs,
		Metadata:      fields.Metadata,
	})
}

// entries returns a copy of the recorded realtime log entries.
func (l *recordingRealtimeLogger) entries() []sharedlogger.LogEntry {
	out := make([]sharedlogger.LogEntry, len(l.entriesList))
	copy(out, l.entriesList)
	return out
}

// newBlockingClient creates a client whose sends wait for cancellation.
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

// consumeControlMessage verifies the connection-gap control payload.
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

// assertAnimeChangedPayload verifies an anime-change realtime payload.
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

// assertPreferencesChangedPayload verifies a preferences-change payload.
func assertPreferencesChangedPayload(t *testing.T, payload []byte, wantSeasonMode bool) {
	t.Helper()

	var msg PreferencesChangedMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		t.Fatalf("unmarshal preferences changed message: %v", err)
	}

	if msg.Type != MessageTypePreferencesChanged {
		t.Fatalf("expected message type %q, got %q", MessageTypePreferencesChanged, msg.Type)
	}
	if msg.SeasonMode != wantSeasonMode {
		t.Fatalf("expected season mode %v, got %v", wantSeasonMode, msg.SeasonMode)
	}
}

// assertAnimeIDPayload verifies a create or delete anime payload.
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
