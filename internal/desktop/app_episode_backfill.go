package desktop

import (
	"context"
	"database/sql"
	"slices"
	"sync"
	"time"

	"autoreas-bridge/internal/anime/backfill"
	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
)

// Snapshot fields whose change may give an anime files to measure. They are the top-level keys of
// anime_snapshots.snapshot_json, which is what AnimeChangedEvent.ChangedFields names.
const (
	snapshotFieldFolder = "folder"
	snapshotFieldActive = "active"
)

// episodeBackfiller is the seam the App drives: the triggers and the shutdown stop.
type episodeBackfiller interface {
	Trigger(scope backfill.Scope)
	Stop()
}

// mobileAnimeLister lists every anime; contracts.AnimeQueryService satisfies it.
type mobileAnimeLister interface {
	ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error)
}

// animeCatalog adapts the anime query to the backfill's catalog.
type animeCatalog struct{ query mobileAnimeLister }

// ListAnime implements backfill.Catalog.
func (c animeCatalog) ListAnime(ctx context.Context) ([]backfill.Anime, error) {
	listed, err := c.query.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]backfill.Anime, 0, len(listed))
	for _, anime := range listed {
		folder := ""
		if anime.Folder != nil {
			folder = *anime.Folder
		}
		out = append(out, backfill.Anime{ID: anime.ID, Active: anime.Active == 1, Folder: folder})
	}
	return out, nil
}

// newEpisodeBackfill builds the duration backfill from the same parts the download notice uses:
// the pipeline's extension set, the identity assigner and ffprobe as found on PATH. log may be nil.
func newEpisodeBackfill(db *sql.DB, query mobileAnimeLister, log logger.Logger, wake func()) *backfill.Backfill {
	return backfill.New(backfill.Deps{
		Catalog:   animeCatalog{query: query},
		Inventory: media.New(config.VideoFileExtensions),
		Assigner:  identity.NewAssigner(),
		Prober:    probe.NewFFProbe(""),
		Store:     episodes.NewStore(db, time.Now).OnPendingMarked(wake),
		Logger:    log,
	})
}

// startEpisodeBackfill starts the durations announcer, then the duration backfill once the bridge
// database and the anime query are ready. Every pass runs in the background, so startup is never
// delayed.
func (a *App) startEpisodeBackfill() {
	a.startEpisodeAnnouncer()
	if a.episodeDurations.offline || a.bridgeDB == nil || a.animeQuery == nil {
		return
	}
	// A nil *FanoutLogger must stay a nil interface, or the backfill would call through it.
	var log logger.Logger
	if a.sharedLogger != nil {
		log = a.sharedLogger
	}
	a.runEpisodeBackfill(newEpisodeBackfill(a.bridgeDB, a.animeQuery, log, a.episodeDurations.wake))
}

// runEpisodeBackfill keeps runner for shutdown, wires its triggers, and starts the process-start
// pass over every active anime (analysis D5).
func (a *App) runEpisodeBackfill(runner episodeBackfiller) {
	a.episodeDurations.backfill = runner
	if a.eventBus != nil {
		subscribeEpisodeBackfill(a.eventBus, runner)
	}
	runner.Trigger(backfill.All())
}

// subscribeEpisodeBackfill wires the two event triggers of the backfill: an anime that may have
// gained files, and a finished download run, for the anime whose episodes landed during it. The
// subscribers only read events; they publish nothing, and Trigger never blocks the publisher.
func subscribeEpisodeBackfill(bus events.Bus, runner episodeBackfiller) {
	bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		if changed, ok := event.(events.AnimeChangedEvent); ok && gainsEpisodeFiles(changed) {
			runner.Trigger(backfill.Only(changed.AnimeID))
		}
	})
	landed := &landedByRun{byRun: map[string][]string{}}
	bus.Subscribe(events.EventNameDownloadEpisodeDownloaded, func(event events.Event) {
		if downloaded, ok := event.(events.DownloadEpisodeDownloadedEvent); ok {
			landed.add(downloaded.RunID, downloaded.AnimeID)
		}
	})
	bus.Subscribe(events.EventNameDownloadRunFinished, func(event events.Event) {
		finished, ok := event.(events.DownloadRunFinishedEvent)
		if !ok {
			return
		}
		if ids := landed.take(finished.RunID); len(ids) > 0 {
			runner.Trigger(backfill.Only(ids...))
		}
	})
}

// gainsEpisodeFiles reports whether an anime change may have given the anime files to measure: it
// was created, its folder changed, or its active flag changed. Publishers leave ChangeType empty
// today, so a create is recognised by its changed fields as well.
func gainsEpisodeFiles(changed events.AnimeChangedEvent) bool {
	return changed.ChangeType == events.AnimeChangeTypeCreate ||
		slices.Contains(changed.ChangedFields, snapshotFieldFolder) ||
		slices.Contains(changed.ChangedFields, snapshotFieldActive)
}

// landedByRun collects, per download run, the anime whose episodes landed during it.
type landedByRun struct {
	mu    sync.Mutex
	byRun map[string][]string
}

// add records that animeID landed an episode in runID.
func (l *landedByRun) add(runID, animeID string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !slices.Contains(l.byRun[runID], animeID) {
		l.byRun[runID] = append(l.byRun[runID], animeID)
	}
}

// take returns the anime that landed episodes in runID, sorted, and forgets the run.
func (l *landedByRun) take(runID string) []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	ids := l.byRun[runID]
	delete(l.byRun, runID)
	slices.Sort(ids)
	return ids
}
