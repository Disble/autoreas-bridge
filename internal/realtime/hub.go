package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/mobilecapture"
)

const defaultSendTimeout = 100 * time.Millisecond

// Client is one websocket connection managed by the realtime hub.
type Client interface {
	ID() string
	Send(ctx context.Context, payload []byte) error
	Close() error
}

// Hub registers clients and broadcasts realtime bridge events.
type Hub interface {
	Register(ctx context.Context, client Client) error
	Unregister(clientID string)
	BroadcastAnimeChanged(ctx context.Context, event events.AnimeChangedEvent)
	BroadcastPreferencesChanged(ctx context.Context, seasonMode bool)
	BroadcastSeasonChanged(ctx context.Context, seasonID, status string)
}

// MemoryHubConfig configures the in-memory websocket fan-out hub.
type MemoryHubConfig struct {
	BroadcastBuffer int
	ClientBuffer    int
	SendTimeout     time.Duration
	Logger          sharedlogger.Logger
	// Capture enqueues one observability row per connection lifecycle event
	// and outbound broadcast (see hub_capture.go). Nil disables hub capture
	// entirely -- every capture call above is a safe no-op without it.
	Capture mobilecapture.CaptureFunc
}

// MemoryHub is an in-memory Hub implementation.
type MemoryHub struct {
	mu              sync.RWMutex
	clients         map[string]*clientState
	broadcasts      chan []byte
	ctx             context.Context
	cancel          context.CancelFunc
	closeOnce       sync.Once
	clientBuffer    int
	sendTimeout     time.Duration
	broadcastClosed chan struct{}
	logger          sharedlogger.Logger
	capture         mobilecapture.CaptureFunc
}

type clientState struct {
	client Client
	queue  chan []byte
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

// NewMemoryHub builds and starts an in-memory websocket hub.
func NewMemoryHub(parent context.Context, config MemoryHubConfig) *MemoryHub {
	if parent == nil {
		parent = context.Background()
	}
	if config.BroadcastBuffer <= 0 {
		config.BroadcastBuffer = 16
	}
	if config.ClientBuffer <= 0 {
		config.ClientBuffer = 8
	}
	if config.SendTimeout <= 0 {
		config.SendTimeout = defaultSendTimeout
	}

	ctx, cancel := context.WithCancel(parent)
	hub := &MemoryHub{
		clients:         make(map[string]*clientState),
		broadcasts:      make(chan []byte, config.BroadcastBuffer),
		ctx:             ctx,
		cancel:          cancel,
		clientBuffer:    config.ClientBuffer,
		sendTimeout:     config.SendTimeout,
		broadcastClosed: make(chan struct{}),
		logger:          config.Logger,
		capture:         config.Capture,
	}

	go hub.run()
	return hub
}

// Register adds or replaces a client connection in the hub.
func (h *MemoryHub) Register(ctx context.Context, client Client) error {
	if client == nil {
		return errors.New("realtime: nil client")
	}
	if client.ID() == "" {
		return errors.New("realtime: empty client id")
	}

	stateCtx, cancel := context.WithCancel(h.ctx)
	state := &clientState{
		client: client,
		queue:  make(chan []byte, h.clientBuffer),
		ctx:    stateCtx,
		cancel: cancel,
		done:   make(chan struct{}),
	}

	h.mu.Lock()
	if existing := h.clients[client.ID()]; existing != nil {
		h.mu.Unlock()
		h.unregisterState(existing)
		h.mu.Lock()
	}
	h.clients[client.ID()] = state
	clientCount := len(h.clients)
	h.mu.Unlock()

	go h.runClient(state)
	if h.logger != nil {
		h.logger.Logf("websocket", sharedlogger.LevelInfo, sharedlogger.Fields{
			EntityID:  client.ID(),
			EventType: "websocket.register",
			Metadata:  map[string]any{"clientCount": clientCount},
		}, "registered client %s", client.ID())
	}
	captureHubConnect(h.capture, client.ID())
	return h.enqueueClientMessage(state, mustJSON(ControlMessage{
		Type:   MessageTypeSyncRequired,
		Reason: SyncReasonConnectionGapAssumed,
	}))
}

// Unregister removes a client connection from the hub.
func (h *MemoryHub) Unregister(clientID string) {
	h.mu.Lock()
	state := h.clients[clientID]
	if state != nil {
		delete(h.clients, clientID)
	}
	clientCount := len(h.clients)
	h.mu.Unlock()

	if state != nil {
		if h.logger != nil {
			h.logger.Logf("websocket", sharedlogger.LevelInfo, sharedlogger.Fields{
				EntityID:  clientID,
				EventType: "websocket.unregister",
				Metadata:  map[string]any{"clientCount": clientCount},
			}, "unregistered client %s", clientID)
		}
		captureHubDisconnect(h.capture, clientID)
		h.unregisterState(state)
	}
}

// BroadcastAnimeChanged fan-outs an anime change event to connected clients.
func (h *MemoryHub) BroadcastAnimeChanged(_ context.Context, event events.AnimeChangedEvent) {
	h.mu.RLock()
	clientCount := len(h.clients)
	h.mu.RUnlock()

	if h.logger != nil {
		h.logger.Logf("websocket", sharedlogger.LevelInfo, sharedlogger.Fields{
			EntityID:      event.AnimeID,
			EventType:     "websocket.broadcast",
			CorrelationID: event.CorrelationID,
			Metadata:      map[string]any{"clientCount": clientCount},
		}, "broadcast anime.changed for %s", event.AnimeID)
	}
	message := buildAnimeEventMessage(event)
	animeID := event.AnimeID
	captureHubBroadcast(h.capture, &animeID, map[string]any{"anime_id": event.AnimeID, "change_type": event.ChangeType})

	select {
	case h.broadcasts <- message:
	default:
	}
}

// BroadcastPreferencesChanged fan-outs preference changes to connected clients.
func (h *MemoryHub) BroadcastPreferencesChanged(_ context.Context, seasonMode bool) {
	h.mu.RLock()
	clientCount := len(h.clients)
	h.mu.RUnlock()

	if h.logger != nil {
		h.logger.Logf("websocket", sharedlogger.LevelInfo, sharedlogger.Fields{
			EventType: "websocket.broadcast",
			Metadata:  map[string]any{"clientCount": clientCount, "seasonMode": seasonMode},
		}, "broadcast preferences.changed (seasonMode=%v)", seasonMode)
	}
	message := mustJSON(PreferencesChangedMessage{
		Type:       MessageTypePreferencesChanged,
		SeasonMode: seasonMode,
	})
	captureHubBroadcast(h.capture, nil, map[string]any{"season_mode": seasonMode})

	select {
	case h.broadcasts <- message:
	default:
	}
}

// BroadcastSeasonChanged fan-outs active-season updates to connected clients.
func (h *MemoryHub) BroadcastSeasonChanged(_ context.Context, seasonID, status string) {
	h.mu.RLock()
	clientCount := len(h.clients)
	h.mu.RUnlock()

	if h.logger != nil {
		h.logger.Logf("websocket", sharedlogger.LevelInfo, sharedlogger.Fields{
			EventType: "websocket.broadcast",
			Metadata:  map[string]any{"clientCount": clientCount, "seasonID": seasonID, "status": status},
		}, "broadcast season.changed (id=%s status=%s)", seasonID, status)
	}
	message := mustJSON(SeasonChangedMessage{
		Type:     MessageTypeSeasonChanged,
		SeasonID: seasonID,
		Status:   status,
	})
	captureHubBroadcast(h.capture, nil, map[string]any{"season_id": seasonID, "status": status})

	select {
	case h.broadcasts <- message:
	default:
	}
}

// buildAnimeEventMessage converts an anime event into its realtime payload.
func buildAnimeEventMessage(event events.AnimeChangedEvent) []byte {
	switch event.ChangeType {
	case events.AnimeChangeTypeCreate:
		return mustJSON(AnimeIDMessage{Type: MessageTypeAnimeCreated, AnimeID: event.AnimeID})
	case events.AnimeChangeTypeDelete:
		return mustJSON(AnimeIDMessage{Type: MessageTypeAnimeDeleted, AnimeID: event.AnimeID})
	default:
		return mustJSON(AnimeChangedMessage{
			Type:    MessageTypeAnimeChanged,
			AnimeID: event.AnimeID,
			Payload: json.RawMessage(append([]byte(nil), event.Payload...)),
		})
	}
}

// ClientCount returns the current number of registered clients.
func (h *MemoryHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Close shuts down the hub and all registered clients.
func (h *MemoryHub) Close() error {
	h.closeOnce.Do(func() {
		h.cancel()
		<-h.broadcastClosed

		h.mu.Lock()
		states := make([]*clientState, 0, len(h.clients))
		for id, state := range h.clients {
			states = append(states, state)
			delete(h.clients, id)
		}
		h.mu.Unlock()

		for _, state := range states {
			h.unregisterState(state)
		}
	})
	return nil
}

// run distributes queued broadcasts to registered clients.
func (h *MemoryHub) run() {
	defer close(h.broadcastClosed)
	for {
		select {
		case <-h.ctx.Done():
			return
		case payload := <-h.broadcasts:
			h.mu.RLock()
			states := make([]*clientState, 0, len(h.clients))
			for _, state := range h.clients {
				states = append(states, state)
			}
			h.mu.RUnlock()

			for _, state := range states {
				_ = h.enqueueClientMessage(state, payload)
			}
		}
	}
}

// runClient delivers queued messages and closes one client connection.
func (h *MemoryHub) runClient(state *clientState) {
	defer close(state.done)
	for {
		select {
		case <-state.ctx.Done():
			_ = state.client.Close()
			return
		case payload := <-state.queue:
			sendCtx, cancel := context.WithTimeout(state.ctx, h.sendTimeout)
			_ = state.client.Send(sendCtx, payload)
			cancel()
		}
	}
}

// enqueueClientMessage queues a copy of a payload without blocking the hub.
func (h *MemoryHub) enqueueClientMessage(state *clientState, payload []byte) error {
	select {
	case <-state.ctx.Done():
		return state.ctx.Err()
	case state.queue <- append([]byte(nil), payload...):
		return nil
	default:
		return nil
	}
}

// unregisterState cancels a client and waits for its delivery loop to finish.
func (h *MemoryHub) unregisterState(state *clientState) {
	state.cancel()
	<-state.done
}

// mustJSON marshals a value and panics when the internal payload is invalid.
func mustJSON(value any) []byte {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return payload
}

var _ Hub = (*MemoryHub)(nil)
