package sync

import (
	"context"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
)

type pendingChangelogStore interface {
	InsertPending(ctx context.Context, entry ChangelogEntry) error
}

type ChangelogRecorder struct {
	bus   events.Bus
	store pendingChangelogStore
	now   func() time.Time

	mu          sync.Mutex
	err         error
	unsubscribe func()
}

func NewChangelogRecorder(bus events.Bus, store pendingChangelogStore) *ChangelogRecorder {
	return &ChangelogRecorder{bus: bus, store: store, now: time.Now}
}

func (r *ChangelogRecorder) Start(ctx context.Context) {
	r.unsubscribe = r.bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		now := r.now
		if now == nil {
			now = time.Now
		}
		changeType := changed.ChangeType
		if changeType == "" {
			changeType = events.AnimeChangeTypeUpdate
		}
		if err := r.store.InsertPending(ctx, ChangelogEntry{
			AnimeID:       changed.AnimeID,
			ChangeType:    changeType,
			ChangedFields: append([]string(nil), changed.ChangedFields...),
			SnapshotJSON:  append([]byte(nil), changed.Payload...),
			Status:        changelogStatusPending,
			ChangedAtMs:   now().UnixMilli(),
		}); err != nil {
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
