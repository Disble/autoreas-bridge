package sync

import (
	"context"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

type pendingChangelogStore interface {
	InsertPending(ctx context.Context, entry ChangelogEntry) error
}

type ChangelogRecorder struct {
	bus   events.Bus
	store pendingChangelogStore
	now   func() time.Time
	log   sharedlogger.Logger

	mu          sync.Mutex
	err         error
	unsubscribe func()
}

func NewChangelogRecorder(bus events.Bus, store pendingChangelogStore, loggers ...sharedlogger.Logger) *ChangelogRecorder {
	recorder := &ChangelogRecorder{bus: bus, store: store, now: time.Now}
	if len(loggers) > 0 {
		recorder.log = loggers[0]
	}
	return recorder
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
			if r.log != nil {
				r.log.Errorf("sync", "failed to record pending changelog for %s: %v", changed.AnimeID, err)
			}
			r.mu.Lock()
			r.err = err
			r.mu.Unlock()
			return
		}
		if r.log != nil {
			r.log.Infof("sync", "recorded pending changelog for %s", changed.AnimeID)
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
