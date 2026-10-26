package sync

import (
	"context"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// changedFieldEpisodes is the changed field of the changelog row an episode-duration announcement
// records: the anime itself did not change, only the episodes served inside it.
const changedFieldEpisodes = "episodes"

type pendingChangelogInserter interface {
	InsertPending(ctx context.Context, entry ChangelogEntry) error
}

// ChangelogRecorder subscribes to episode.durations_changed events and records pending changelog
// rows. It does not subscribe to anime.changed: every anime save stores its own changelog row
// inside the save transaction (AnimeSaveStore), so the event only announces a row already stored.
type ChangelogRecorder struct {
	bus   events.Bus
	store pendingChangelogInserter
	now   func() time.Time
	log   sharedlogger.Logger

	mu           sync.Mutex
	err          error
	unsubscribes []func()
}

// NewChangelogRecorder builds the event-bus recorder that persists pending changelog rows.
func NewChangelogRecorder(bus events.Bus, store pendingChangelogInserter, loggers ...sharedlogger.Logger) *ChangelogRecorder {
	recorder := &ChangelogRecorder{bus: bus, store: store, now: time.Now}
	if len(loggers) > 0 {
		recorder.log = loggers[0]
	}
	return recorder
}

// Start subscribes the recorder to episode.durations_changed events until Stop is called.
//
// An episode-duration announcement records the same ordinary update row an anime edit records, with
// the current snapshot and changed_fields ["episodes"], so Mobile's reconcile needs nothing new: the
// episodes are joined into the anime when the row is served (analysis D6).
func (r *ChangelogRecorder) Start(ctx context.Context) {
	r.unsubscribes = append(r.unsubscribes, r.bus.Subscribe(events.EventNameEpisodeDurationsChanged, func(event events.Event) {
		changed, ok := event.(events.EpisodeDurationsChangedEvent)
		if !ok {
			return
		}
		r.record(ctx, ChangelogEntry{
			SourceEventID: changed.EventID,
			AnimeID:       changed.AnimeID,
			ChangeType:    events.AnimeChangeTypeUpdate,
			ChangedFields: []string{changedFieldEpisodes},
			SnapshotJSON:  append([]byte(nil), changed.Payload...),
		})
	}))
}

// record stamps and stores one pending changelog row, keeping the last failure for Err.
func (r *ChangelogRecorder) record(ctx context.Context, entry ChangelogEntry) {
	now := r.now
	if now == nil {
		now = time.Now
	}
	entry.Status = changelogStatusPending
	entry.ChangedAtMs = now().UnixMilli()
	if err := r.store.InsertPending(ctx, entry); err != nil {
		if r.log != nil {
			metadata := changelogEntryMetadata(entry)
			metadata["cause"] = err.Error()
			r.log.Logf("sync", sharedlogger.LevelError, sharedlogger.Fields{
				EntityID:  entry.AnimeID,
				EventType: "sync.changelog",
				Metadata:  metadata,
			}, "failed to record pending changelog for %s: %v", entry.AnimeID, err)
		}
		r.mu.Lock()
		r.err = err
		r.mu.Unlock()
		return
	}
	if r.log != nil {
		r.log.Logf("sync", sharedlogger.LevelInfo, sharedlogger.Fields{
			EntityID:  entry.AnimeID,
			EventType: "sync.changelog",
			Metadata:  changelogEntryMetadata(entry),
		}, "recorded pending changelog for %s", entry.AnimeID)
	}
}

// changelogEntryMetadata identifies a changelog row in its log entry without its snapshot: the
// event that caused it, the change type and the fields it changed.
func changelogEntryMetadata(entry ChangelogEntry) map[string]any {
	return map[string]any{
		"sourceEventId": entry.SourceEventID,
		"changeType":    entry.ChangeType,
		"changedFields": entry.ChangedFields,
	}
}

// Stop unsubscribes the recorder from the event bus.
func (r *ChangelogRecorder) Stop() {
	for _, unsubscribe := range r.unsubscribes {
		unsubscribe()
	}
	r.unsubscribes = nil
}

// Err returns the last persistence error observed by the recorder.
func (r *ChangelogRecorder) Err() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.err
}
