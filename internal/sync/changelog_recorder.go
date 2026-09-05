package sync

import (
	"context"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

type pendingChangelogInserter interface {
	InsertPending(ctx context.Context, entry ChangelogEntry) error
}

// ChangelogRecorder subscribes to anime.changed events and records pending changelog rows.
type ChangelogRecorder struct {
	bus   events.Bus
	store pendingChangelogInserter
	now   func() time.Time
	log   sharedlogger.Logger

	mu          sync.Mutex
	err         error
	unsubscribe func()
}

// NewChangelogRecorder builds the event-bus recorder that persists pending changelog rows.
func NewChangelogRecorder(bus events.Bus, store pendingChangelogInserter, loggers ...sharedlogger.Logger) *ChangelogRecorder {
	recorder := &ChangelogRecorder{bus: bus, store: store, now: time.Now}
	if len(loggers) > 0 {
		recorder.log = loggers[0]
	}
	return recorder
}

// Start subscribes the recorder to anime.changed events until Stop is called.
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
			SourceEventID: changed.EventID,
			AnimeID:       changed.AnimeID,
			ChangeType:    changeType,
			ChangedFields: append([]string(nil), changed.ChangedFields...),
			SnapshotJSON:  append([]byte(nil), changed.Payload...),
			Status:        changelogStatusPending,
			ChangedAtMs:   now().UnixMilli(),
		}); err != nil {
			if r.log != nil {
				r.log.Logf("sync", sharedlogger.LevelError, sharedlogger.Fields{
					EntityID:      changed.AnimeID,
					EventType:     "sync.changelog",
					CorrelationID: changed.CorrelationID,
				}, "failed to record pending changelog for %s: %v", changed.AnimeID, err)
			}
			r.mu.Lock()
			r.err = err
			r.mu.Unlock()
			return
		}
		if r.log != nil {
			r.log.Logf("sync", sharedlogger.LevelInfo, sharedlogger.Fields{
				EntityID:      changed.AnimeID,
				EventType:     "sync.changelog",
				CorrelationID: changed.CorrelationID,
			}, "recorded pending changelog for %s", changed.AnimeID)
		}
	})
}

// Stop unsubscribes the recorder from the event bus.
func (r *ChangelogRecorder) Stop() {
	if r.unsubscribe != nil {
		r.unsubscribe()
	}
}

// Err returns the last persistence error observed by the recorder.
func (r *ChangelogRecorder) Err() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.err
}
