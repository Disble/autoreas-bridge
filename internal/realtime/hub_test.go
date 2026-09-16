package realtime

import (
	"context"
	"encoding/json"
	"sort"
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
		Payload: []byte(`{"name":"Bleach"}`),
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

// TestMemoryHubConnectedDeviceIDsDedupsMultipleClientsPerDevice pins that
// presence is keyed on the device, not the per-connection client ID: a
// reconnect (or a second tab) registers a distinct client ID for the same
// device, and that must still count as one connected device.
func TestMemoryHubConnectedDeviceIDsDedupsMultipleClientsPerDevice(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{})
	t.Cleanup(func() { _ = hub.Close() })

	first := newRecordingClientForDevice("device-1-1", "device-1")
	second := newRecordingClientForDevice("device-1-2", "device-1")
	other := newRecordingClientForDevice("device-2-1", "device-2")
	if err := hub.Register(context.Background(), first); err != nil {
		t.Fatalf("register first: %v", err)
	}
	if err := hub.Register(context.Background(), second); err != nil {
		t.Fatalf("register second: %v", err)
	}
	if err := hub.Register(context.Background(), other); err != nil {
		t.Fatalf("register other: %v", err)
	}

	got := hub.ConnectedDeviceIDs()
	sort.Strings(got)
	if len(got) != 2 || got[0] != "device-1" || got[1] != "device-2" {
		t.Fatalf("expected deduped device ids [device-1 device-2], got %v", got)
	}
}

// TestMemoryHubConnectedDeviceIDsSkipsClientsWithoutADeviceID guards the
// defensive branch in ConnectedDeviceIDs: a Client implementation that
// reports no device identity (a bug, or a transport that never learned one)
// must not be surfaced as a "connected" empty-string device.
func TestMemoryHubConnectedDeviceIDsSkipsClientsWithoutADeviceID(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{})
	t.Cleanup(func() { _ = hub.Close() })

	anonymous := newRecordingClientForDevice("anonymous-1", "")
	known := newRecordingClientForDevice("device-1-1", "device-1")
	if err := hub.Register(context.Background(), anonymous); err != nil {
		t.Fatalf("register anonymous: %v", err)
	}
	if err := hub.Register(context.Background(), known); err != nil {
		t.Fatalf("register known: %v", err)
	}

	got := hub.ConnectedDeviceIDs()
	if len(got) != 1 || got[0] != "device-1" {
		t.Fatalf("expected only [device-1], got %v", got)
	}
}

// TestMemoryHubConnectedDeviceIDsExcludesUnregisteredClients pins that a
// disconnected client's device stops being reported as present.
func TestMemoryHubConnectedDeviceIDsExcludesUnregisteredClients(t *testing.T) {
	t.Parallel()

	hub := NewMemoryHub(context.Background(), MemoryHubConfig{})
	t.Cleanup(func() { _ = hub.Close() })

	client := newRecordingClientForDevice("device-1-1", "device-1")
	if err := hub.Register(context.Background(), client); err != nil {
		t.Fatalf("register: %v", err)
	}
	hub.Unregister(client.ID())

	if got := hub.ConnectedDeviceIDs(); len(got) != 0 {
		t.Fatalf("expected no connected devices after unregister, got %v", got)
	}
}

type recordingClient struct {
	id       string
	deviceID string
	received chan []byte
	closed   chan struct{}
}

// newRecordingClient creates a client that records delivered payloads. The
// device ID defaults to the connection ID, which is fine for every test that
// does not care about device-level presence grouping.
func newRecordingClient(id string) *recordingClient {
	return newRecordingClientForDevice(id, id)
}

// newRecordingClientForDevice creates a client with a connection ID distinct
// from its device ID, mirroring a real reconnect where the same device holds
// a new composite client ID.
func newRecordingClientForDevice(id, deviceID string) *recordingClient {
	return &recordingClient{
		id:       id,
		deviceID: deviceID,
		received: make(chan []byte, 8),
		closed:   make(chan struct{}),
	}
}

func (c *recordingClient) ID() string {
	return c.id
}

func (c *recordingClient) DeviceID() string {
	return c.deviceID
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

func (c *blockingClient) DeviceID() string {
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
func assertAnimeIDPayload(t *testing.T, payload []byte, wantType, wantAnimeID string) {
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
