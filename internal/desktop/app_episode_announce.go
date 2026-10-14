package desktop

import (
	"context"
	"sync/atomic"
	"time"

	"autoreas-bridge/internal/anime/announce"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
)

// episodeDurationsRuntime owns the two background parts of episode durations: the backfill that
// measures missing episodes and the announcer that tells Mobile a duration changed.
//
// The announcer is held atomically because the download run's landed recording can wake it from its
// own goroutine before the announcer is started; a wake before then is simply dropped, and the
// announcer's first pass picks up every mark left behind.
type episodeDurationsRuntime struct {
	backfill  episodeBackfiller
	announcer atomic.Pointer[announce.Announcer]
	// offline keeps both background parts from starting. It is the test seam of the shared startup
	// test app, whose bare &sql.DB{} panics on any query: a background pass would recover and log
	// that panic while the test is still reading what startup logged.
	offline bool
}

// wake asks the announcer for a pass. It never blocks; it is the store hook of every duration write.
func (r *episodeDurationsRuntime) wake() {
	if announcer := r.announcer.Load(); announcer != nil {
		announcer.Trigger()
	}
}

// stop ends the backfill first, since its writes wake the announcer, then the announcer.
func (r *episodeDurationsRuntime) stop() {
	if r.backfill != nil {
		r.backfill.Stop()
	}
	if announcer := r.announcer.Load(); announcer != nil {
		announcer.Stop()
	}
}

// startEpisodeAnnouncer starts the durations announcer and its process-start pass, which announces
// every mark a previous run left behind (analysis D6). It must start after the changelog recorder
// and the realtime hub subscribe, so no announcement goes unheard.
func (a *App) startEpisodeAnnouncer() {
	if a.episodeDurations.offline || a.bridgeDB == nil || a.eventBus == nil {
		return
	}
	// A nil *FanoutLogger must stay a nil interface, or the announcer would call through it.
	var log logger.Logger
	if a.sharedLogger != nil {
		log = a.sharedLogger
	}
	announcer := announce.New(announce.Deps{
		Pending:   episodes.NewStore(a.bridgeDB, time.Now),
		Snapshots: announceSnapshots{store: bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)},
		Bus:       a.eventBus,
		Logger:    log,
		// The changelog recorder writes under catchUpContext, which shutdown cancels first: the
		// announcer must end with it, or it could clear a mark whose changelog row failed.
		Parent: a.catchUpContext,
	})
	a.episodeDurations.announcer.Store(announcer)
	announcer.Trigger()
}

// announceSnapshots reads the current snapshot bytes the announcement carries: the same canonical
// snapshot_json an AnimeChangedEvent carries.
type announceSnapshots struct {
	store *bridgeSync.AnimeSnapshotStore
}

// Snapshot returns one anime's canonical snapshot JSON.
func (s announceSnapshots) Snapshot(ctx context.Context, animeID string) ([]byte, error) {
	record, err := s.store.GetSnapshot(ctx, animeID)
	if err != nil {
		return nil, err
	}
	return record.CanonicalJSON, nil
}

// subscribeHubToEpisodeDurations tells connected phones about an episode-duration announcement with
// the same anime_changed message an edit sends, so Mobile reconciles as it already does. Only the hub
// is handed the announcement; it is never published as an AnimeChangedEvent.
func subscribeHubToEpisodeDurations(ctx context.Context, bus events.Bus, hub realtime.Hub) {
	bus.Subscribe(events.EventNameEpisodeDurationsChanged, func(event events.Event) {
		changed, ok := event.(events.EpisodeDurationsChangedEvent)
		if !ok {
			return
		}
		hub.BroadcastAnimeChanged(ctx, events.AnimeChangedEvent{
			EventID:       changed.EventID,
			AnimeID:       changed.AnimeID,
			Payload:       changed.Payload,
			ChangeType:    events.AnimeChangeTypeUpdate,
			ChangedFields: []string{"episodes"},
		})
	})
}
