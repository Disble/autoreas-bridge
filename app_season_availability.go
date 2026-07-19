package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/download/sites/jkanime"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/schedule"
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

func (p seasonAvailabilityProbe) AvailableEpisodes(ctx context.Context, pageURL string) (int, error) {
	source, err := p.registry.Resolve(pageURL)
	if err != nil {
		return 0, nil
	}
	listing, err := source.ListEpisodes(ctx, pageURL)
	if err != nil {
		return 0, err
	}
	if listing.LatestEpisode < 0 {
		return 0, nil
	}
	return listing.LatestEpisode, nil
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

// readRecordLister returns the anime query service's record-listing capability.
func (a *App) readRecordLister() (animeReadRecordLister, bool) {
	query, ok := a.animeQuery.(animeReadRecordLister)
	return query, ok
}

// animeSectionsByID returns each anime's current section (first days entry)
// keyed by anime id, so the season board can show which created animes are in
// Sin ver vs Ver hoy vs Visto. Empty map on any read error.
func (a *App) animeSectionsByID(ctx context.Context) map[string]string {
	out := map[string]string{}
	query, ok := a.readRecordLister()
	if !ok {
		return out
	}
	records, err := query.ListReadRecords(ctx)
	if err != nil {
		return out
	}
	for _, record := range records {
		if days := record.Value.Days; len(days) > 0 {
			out[record.Value.ID] = days[0].Day
		}
	}
	return out
}

// animeWatchedState extracts the section and progress from an anime payload.
func animeWatchedState(payload []byte) (string, float64, bool) {
	value, _, err := legacy.Decode(payload)
	if err != nil {
		return "", 0, false
	}
	section := ""
	if len(value.Days) > 0 {
		section = value.Days[0].Day
	}
	return section, value.Progress, true
}

// startSeasonAvailability wires the probe + gateway into the season service and
// starts the daily availability scheduler (a second schedule.Scheduler instance,
// composing the same generic component as downloads).
func (a *App) startSeasonAvailability(ctx context.Context) {
	if a.seasonService == nil || a.animeWrite == nil || a.bridgeDB == nil {
		return
	}
	readQuery, ok := a.readRecordLister()
	if !ok {
		return
	}
	registry := download.NewStaticRegistry()
	registry.Register(jkanime.New(nil))
	probe := seasonAvailabilityProbe{registry: registry}
	a.animeCreate = anime.NewCreateService(a.animeWrite, seasonAnimeMetadataProvider{registry: registry})
	a.seasonService.SetAvailabilityDeps(
		probe,
		seasonAnimeGateway{
			writer: a.animeWrite, creator: a.animeCreate,
			records: readQuery,
		},
	)

	a.seasonScheduler = schedule.NewScheduler(schedule.Deps{
		Store: &seasonScheduleStore{},
		Clock: schedule.NewRealClock(),
		Run:   a.runSeasonAvailability,
		Log:   a.sharedLogger,
	})
	a.seasonScheduler.Start(ctx)

	a.subscribeSeasonWatched(ctx)
}

// subscribeSeasonWatched wires the event-driven Ver hoy → Visto auto-transition:
// on any anime change, a created season anime watched in Ver hoy moves to Visto.
func (a *App) subscribeSeasonWatched(ctx context.Context) {
	if a.eventBus == nil {
		return
	}
	a.eventBus.Subscribe(events.EventNameAnimeChanged, func(ev events.Event) {
		changed, ok := ev.(events.AnimeChangedEvent)
		if !ok || a.seasonService == nil {
			return
		}
		section, progress, found := animeWatchedState(changed.Payload)
		if !found {
			return
		}
		_ = a.seasonService.HandleAnimeWatched(ctx, changed.AnimeID, section, progress)
	})
}

// runSeasonAvailability is the scheduler RunFunc: while a season is open it only
// REFRESHES availability (which names can now be created). It never creates and
// never downloads — creation is an explicit, consent-gated user action, and
// downloads are triggered only when an anime is sent to "Ver hoy".
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
	if len(res.Available) > 0 {
		a.notifySeasonAvailable(ctx, res.Available)
	}
	return fmt.Sprintf("checked=%d available=%d", res.Checked, len(res.Available)), nil
}

// SendToVerHoyDTO reports the outcome of staging animes into "Ver hoy". When the
// daily auto-download window has already passed (PastDownloadTime), the scheduled
// run will not pick the animes up today, so the UI surfaces a manual download
// option; otherwise the scheduled run downloads them automatically at DownloadTime.
type SendToVerHoyDTO struct {
	Status           string `json:"status"`
	PastDownloadTime bool   `json:"pastDownloadTime"`
	DownloadTime     string `json:"downloadTime"`
}

// SendSeasonAnimesToVerHoy stages the given created animes into "Ver hoy" (the
// Daily Board's multi-select "watch today"). It does NOT force a download run:
// the animes ride the scheduled daily download at DownloadTime. When that window
// has already passed for today (PastDownloadTime), it notifies the user and the UI
// offers a manual download so they still have episodes to watch today.
func (a *App) SendSeasonAnimesToVerHoy(animeIDs []string) SendToVerHoyDTO {
	if a.episodeService == nil {
		return SendToVerHoyDTO{Status: "chapter service unavailable"}
	}
	for _, id := range animeIDs {
		result, err := a.episodeService.SetAnimeDays(a.seasonCtx(), anime.SetAnimeDaysCommand{
			AnimeID: id,
			Dias:    []string{"Ver hoy"},
		})
		if err != nil {
			return SendToVerHoyDTO{Status: err.Error()}
		}
		switch result.Outcome {
		case anime.PatchOutcomeApplied, anime.PatchOutcomeNoOp:
		case anime.PatchOutcomeConflict:
			return SendToVerHoyDTO{Status: fmt.Sprintf("anime mutation conflict: anime=%s modifiedAt=%d conflictId=%s", result.AnimeID, result.ModifiedAt, result.ConflictID)}
		default:
			return SendToVerHoyDTO{Status: fmt.Sprintf("unexpected anime mutation outcome %q", result.Outcome)}
		}
	}
	a.broadcastSeasonChanged()

	downloadTime, passed := a.seasonDownloadWindowPassed()
	if passed {
		a.notifySeasonPastDownloadWindow(a.seasonCtx(), len(animeIDs), downloadTime)
	}
	return SendToVerHoyDTO{Status: "ok", PastDownloadTime: passed, DownloadTime: downloadTime}
}

// TriggerSeasonDownloads is the manual "download now" the Daily Board offers when a
// Ver hoy batch missed the daily auto-download window. Degrades to "ok" (no-op)
// when the scheduler is unavailable, mirroring the season bindings' nil-tolerance.
func (a *App) TriggerSeasonDownloads() string {
	a.triggerDownloadsForSeason(a.seasonCtx())
	return "ok"
}

// seasonDownloadWindowPassed reports the configured daily download time and whether
// today's auto-download window has already passed — true when the schedule is
// disabled/absent or now is past the configured HH:MM, so the scheduled run will
// not catch a just-sent batch today.
func (a *App) seasonDownloadWindowPassed() (string, bool) {
	if a.downloadStore == nil {
		return "", true
	}
	cfg, err := a.downloadStore.GetScheduleConfig(a.downloadCtx())
	if err != nil {
		return "", true
	}
	if !cfg.Enabled || cfg.DailyTimeHHMM == "" {
		return cfg.DailyTimeHHMM, true
	}
	scheduled, err := time.Parse("15:04", cfg.DailyTimeHHMM)
	if err != nil {
		return cfg.DailyTimeHHMM, true
	}
	now := a.currentTime()
	window := time.Date(now.Year(), now.Month(), now.Day(), scheduled.Hour(), scheduled.Minute(), 0, 0, now.Location())
	return cfg.DailyTimeHHMM, now.After(window)
}

// currentTime returns the configured clock time for the application.
func (a *App) currentTime() time.Time {
	if a != nil && a.nowTime != nil {
		return a.nowTime()
	}
	return time.Now()
}

// notifySeasonPastDownloadWindow informs the user that manual downloads are needed.
func (a *App) notifySeasonPastDownloadWindow(ctx context.Context, count int, hhmm string) {
	if a.notifier == nil {
		return
	}
	body := fmt.Sprintf("%d anime sent to Ver hoy after today's download. Download them manually to watch today.", count)
	if hhmm != "" {
		body = fmt.Sprintf("%d anime sent to Ver hoy after the %s auto-download. Download them manually to watch today.", count, hhmm)
	}
	_ = a.notifier.Notify(ctx, notification.Notification{
		Title:     "Past today's download window",
		Body:      body,
		Level:     notification.LevelWarning,
		Source:    "season",
		Timestamp: time.Now(),
	})
}

// notifySeasonAvailable informs the user about newly available season anime.
func (a *App) notifySeasonAvailable(ctx context.Context, names []string) {
	if a.notifier == nil {
		return
	}
	_ = a.notifier.Notify(ctx, notification.Notification{
		Title:     "Available to create",
		Body:      fmt.Sprintf("%d anime now available — create them when you want: %s", len(names), strings.Join(names, ", ")),
		Level:     notification.LevelInfo,
		Source:    "season",
		Timestamp: time.Now(),
	})
}

// triggerDownloadsForSeason starts the download scheduler for a season batch.
func (a *App) triggerDownloadsForSeason(ctx context.Context) {
	if a.downloadScheduler == nil {
		return
	}
	if err := a.downloadScheduler.TriggerNow(ctx, "season-availability"); err != nil &&
		!errors.Is(err, schedule.ErrRunInProgress) && a.sharedLogger != nil {
		a.sharedLogger.Warnf("season", "failed to chain download run after availability: %v", err)
	}
}
