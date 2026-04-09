package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

const defaultSendTimeout = 100 * time.Millisecond

type Client interface {
	ID() string
	Send(ctx context.Context, payload []byte) error
	Close() error
}

type Hub interface {
	Register(ctx context.Context, client Client) error
	Unregister(clientID string)
	BroadcastAnimeChanged(ctx context.Context, event events.AnimeChangedEvent)
}

type MemoryHubConfig struct {
	BroadcastBuffer int
	ClientBuffer    int
	SendTimeout     time.Duration
	Logger          sharedlogger.Logger
}

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
}

type clientState struct {
	client Client
	queue  chan []byte
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

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
	}

	go hub.run()
	return hub
}

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
	h.mu.Unlock()

	go h.runClient(state)
	if h.logger != nil {
		h.logger.Infof("websocket", "registered client %s", client.ID())
	}
	return h.enqueueClientMessage(state, mustJSON(ControlMessage{
		Type:   MessageTypeSyncRequired,
		Reason: SyncReasonConnectionGapAssumed,
	}))
}

func (h *MemoryHub) Unregister(clientID string) {
	h.mu.Lock()
	state := h.clients[clientID]
	if state != nil {
		delete(h.clients, clientID)
	}
	h.mu.Unlock()

	if state != nil {
		if h.logger != nil {
			h.logger.Infof("websocket", "unregistered client %s", clientID)
		}
		h.unregisterState(state)
	}
}

func (h *MemoryHub) BroadcastAnimeChanged(_ context.Context, event events.AnimeChangedEvent) {
	if h.logger != nil {
		h.logger.Infof("websocket", "broadcast anime.changed for %s", event.AnimeID)
	}
	message := buildAnimeEventMessage(event)

	select {
	case h.broadcasts <- message:
	default:
	}
}

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

func (h *MemoryHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

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

func (h *MemoryHub) unregisterState(state *clientState) {
	state.cancel()
	<-state.done
}

func mustJSON(value any) []byte {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return payload
}

var _ Hub = (*MemoryHub)(nil)
