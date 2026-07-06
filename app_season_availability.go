package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	bridgeSync "autoreas-bridge/internal/sync"
)

const seasonCheckDailyTimeHHMM = "21:00" // local time; the user runs in GMT-5.
const allWeekdaysMask byte = 0x7F        // bits 0..6 = Sunday..Saturday, every day enabled.

// siteResolver is the narrow read seam the probe needs (Resolve only), so a
// test fake need not implement the full download.SiteRegistry.
type siteResolver interface {
	Resolve(pageURL string) (sites.EpisodeSource, error)
}

// seasonAvailabilityProbe adapts the download sites registry to
// season.AvailabilityProbe: an anime's ch.1 is available once the site reports a
// latest episode >= 1. An unsupported/unresolvable page degrades to "not
// available" (not an error) so the recheck run never fails on a bad row.
type seasonAvailabilityProbe struct {
	registry siteResolver
}

func (p seasonAvailabilityProbe) HasChapterOne(ctx context.Context, pageURL string) (bool, error) {
	source, err := p.registry.Resolve(pageURL)
	if err != nil {
		return false, nil
	}
	listing, err := source.ListEpisodes(ctx, pageURL)
	if err != nil {
		return false, err
	}
	return listing.LatestEpisode >= 1, nil
}

// animeSnapshotLister is the narrow read seam the gateway needs to find animes
// by their raw pagina (the query read-models deliberately hide the URL).
type animeSnapshotLister interface {
	ListSnapshots(ctx context.Context) (map[string]anime.SnapshotRecord, error)
}

// seasonAnimeGateway adapts the anime WriteService + snapshot store to
// season.AnimeGateway at the composition root, so the season context never
// imports the anime context.
type seasonAnimeGateway struct {
	writer    *anime.WriteService
	snapshots animeSnapshotLister
}

func (g seasonAnimeGateway) CreateAnime(ctx context.Context, in season.AnimeCreateInput) (string, error) {
	return g.writer.CreateAnime(ctx, contracts.AnimeCreate{
		Nombre:  in.Nombre,
		Pagina:  in.Pagina,
		Section: in.Section,
		Orden:   g.nextOrden(ctx, in.Section),
	})
}

func (g seasonAnimeGateway) FindActiveByPagina(ctx context.Context, pageURL string) (string, bool, error) {
	records, err := g.snapshots.ListSnapshots(ctx)
	if err != nil {
		return "", false, err
	}
	for id, rec := range records {
		var raw domain.LegacyAnimeRaw
		if json.Unmarshal(rec.CanonicalJSON, &raw) != nil {
			continue
		}
		if raw.Activo.TriState() != domain.TriStateTrue {
			continue
		}
		if p := raw.Pagina.String(); p != nil && *p == pageURL {
			return id, true, nil
		}
	}
	return "", false, nil
}

// nextOrden returns the next free orden at the end of section, scanning every
// anime's dias. Degrades to 1 on a read error.
func (g seasonAnimeGateway) nextOrden(ctx context.Context, section string) int {
	records, err := g.snapshots.ListSnapshots(ctx)
	if err != nil {
		return 1
	}
	max := 0
	for _, rec := range records {
		var raw domain.LegacyAnimeRaw
		if json.Unmarshal(rec.CanonicalJSON, &raw) != nil {
			continue
		}
		for _, d := range raw.Dias.Values() {
			if d.Dia == section && int(d.Orden) > max {
				max = int(d.Orden)
			}
		}
	}
	return max + 1
}

// seasonScheduleStore is a fixed schedule.ConfigStore for the daily availability
// job: it runs every day at 21:00 local (SDD-43). Run bookkeeping is kept in
// memory (the season job needs no persisted schedule config yet).
type seasonScheduleStore struct {
	mu         sync.Mutex
	lastAtMs   int64
	lastStatus string
	nextAtMs   int64
}

func (s *seasonScheduleStore) GetScheduleConfig(_ context.Context) (download.ScheduleConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return download.ScheduleConfig{
		Mode:            "daily",
		DailyTimeHHMM:   seasonCheckDailyTimeHHMM,
		Enabled:         true,
		EnabledWeekdays: allWeekdaysMask,
		LastRunAtMs:     s.lastAtMs,
		LastRunStatus:   s.lastStatus,
		NextRunAtMs:     s.nextAtMs,
	}, nil
}

func (s *seasonScheduleStore) MarkScheduleRun(_ context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	s.mu.Lock()
	s.lastAtMs, s.lastStatus, s.nextAtMs = lastAtMs, status, nextAtMs
	s.mu.Unlock()
	return nil
}

// startSeasonAvailability wires the probe + gateway into the season service and
// starts the daily availability scheduler (a second schedule.Scheduler instance,
// composing the same generic component as downloads).
func (a *App) startSeasonAvailability(ctx context.Context) {
	if a.seasonService == nil || a.animeWrite == nil || a.bridgeDB == nil {
		return
	}
	registry := download.NewStaticRegistry()
	registry.Register(jkanime.New(nil))
	a.seasonService.SetAvailabilityDeps(
		seasonAvailabilityProbe{registry: registry},
		seasonAnimeGateway{writer: a.animeWrite, snapshots: bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)},
	)

	a.seasonScheduler = schedule.NewScheduler(schedule.Deps{
		Store: &seasonScheduleStore{},
		Clock: schedule.NewRealClock(),
		Run:   a.runSeasonAvailability,
		Log:   a.sharedLogger,
	})
	a.seasonScheduler.Start(ctx)
}

// runSeasonAvailability is the scheduler RunFunc: it rechecks availability only
// while a season is open (season mode is derived from that), then notifies and
// chains a download run when new animes became available.
func (a *App) runSeasonAvailability(ctx context.Context, _ string) (string, error) {
	if a.seasonService == nil {
		return "", nil
	}
	active, err := a.seasonService.ActiveSeason(ctx)
	if err != nil {
		return "", err
	}
	if active == nil {
		return "skipped: no open season", nil
	}
	res, err := a.seasonService.RecheckAvailability(ctx, active.ID)
	if err != nil {
		return "", err
	}
	if len(res.Created) > 0 {
		a.notifySeasonAvailable(ctx, res.Created)
		a.triggerDownloadsForSeason(ctx)
	}
	return fmt.Sprintf("checked=%d created=%d", res.Checked, len(res.Created)), nil
}

func (a *App) notifySeasonAvailable(ctx context.Context, names []string) {
	if a.notifier == nil {
		return
	}
	_ = a.notifier.Notify(ctx, notification.Notification{
		Title:     "Available today",
		Body:      fmt.Sprintf("%d anime ready to watch: %s", len(names), strings.Join(names, ", ")),
		Level:     notification.LevelInfo,
		Source:    "season",
		Timestamp: time.Now(),
	})
}

func (a *App) triggerDownloadsForSeason(ctx context.Context) {
	if a.downloadScheduler == nil {
		return
	}
	if err := a.downloadScheduler.TriggerNow(ctx, "season-availability"); err != nil &&
		!errors.Is(err, schedule.ErrRunInProgress) && a.sharedLogger != nil {
		a.sharedLogger.Warnf("season", "failed to chain download run after availability: %v", err)
	}
}
