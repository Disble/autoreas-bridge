package sync

import (
	"context"
	"sync"

	"autoreas-bridge/internal/events"
)

type pendingChangelogStore interface {
	InsertPending(ctx context.Context, event events.AnimeChangedEvent) error
}

type ChangelogRecorder struct {
	bus   events.Bus
	store pendingChangelogStore

	mu          sync.Mutex
	err         error
	unsubscribe func()
}

func NewChangelogRecorder(bus events.Bus, store pendingChangelogStore) *ChangelogRecorder {
	return &ChangelogRecorder{bus: bus, store: store}
}

func (r *ChangelogRecorder) Start(ctx context.Context) {
	r.unsubscribe = r.bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		if err := r.store.InsertPending(ctx, changed); err != nil {
			r.mu.Lock()
			r.err = err
			r.mu.Unlock()
		}
	})
}

func (r *ChangelogRecorder) Stop() {
	if r.unsubscribe != nil {
		r.unsubscribe()
	}
}

func (r *ChangelogRecorder) Err() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.err
}
