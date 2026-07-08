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
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	seasondomain "autoreas-bridge/internal/season/domain"
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

func (p seasonAvailabilityProbe) AvailableChapters(ctx context.Context, pageURL string) (int, error) {
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
		Carpeta: in.Carpeta,
	})
}

func (g seasonAnimeGateway) MoveToSection(ctx context.Context, animeID, section string) error {
	// base 0 relies on the app's staged-rollout OCCObserveOnly=true (last-call-wins);
	// PreserveLastWatched keeps a section change from stamping fechaUltCapVisto.
	return g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		Dias:                []string{section},
		PreserveLastWatched: true,
	})
}

func (g seasonAnimeGateway) SetSelection(ctx context.Context, animeID string, estado int, activo bool) error {
	// base 0 relies on the app's staged-rollout OCCObserveOnly=true (last-call-wins);
	// PreserveLastWatched keeps a selection write from stamping fechaUltCapVisto.
	return g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		Estado:              &estado,
		Activo:              &activo,
		PreserveLastWatched: true,
	})
}

func (g seasonAnimeGateway) SetAnimeSchedule(ctx context.Context, animeID string, dias []seasondomain.Placement) error {
	days := make([]contracts.MobileAnimeDay, 0, len(dias))
	for _, d := range dias {
		days = append(days, contracts.MobileAnimeDay{Dia: d.Dia, Orden: d.Orden})
	}
	// base 0 relies on the app's staged-rollout OCCObserveOnly=true (last-call-wins);
	// PreserveLastWatched keeps a schedule write from stamping fechaUltCapVisto.
	return g.writer.PatchAnime(ctx, animeID, contracts.AnimePatch{
		DiasOrdered:         days,
		PreserveLastWatched: true,
	})
}

func (g seasonAnimeGateway) CurrentPlacements(ctx context.Context, animeIDs []string) (map[string][]seasondomain.Placement, error) {
	records, err := g.snapshots.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	want := make(map[string]struct{}, len(animeIDs))
	for _, id := range animeIDs {
		want[id] = struct{}{}
	}
	out := map[string][]seasondomain.Placement{}
	for id := range want {
		rec, ok := records[id]
		if !ok {
			continue
		}
		var raw domain.LegacyAnimeRaw
		if json.Unmarshal(rec.CanonicalJSON, &raw) != nil {
			continue
		}
		var placements []seasondomain.Placement
		for _, d := range raw.Dias.Values() {
			placements = append(placements, seasondomain.Placement{Dia: d.Dia, Orden: int(d.Orden)})
		}
		out[id] = placements
	}
	return out, nil
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

// animeSectionsByID returns each anime's current section (first dias entry)
// keyed by anime id, so the season board can show which created animes are in
// Sin ver vs Ver hoy vs Visto. Empty map on any read error.
func (a *App) animeSectionsByID(ctx context.Context) map[string]string {
	out := map[string]string{}
	if a.bridgeDB == nil {
		return out
	}
	records, err := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB).ListSnapshots(ctx)
	if err != nil {
		return out
	}
	for id, rec := range records {
		var raw domain.LegacyAnimeRaw
		if json.Unmarshal(rec.CanonicalJSON, &raw) != nil {
			continue
		}
		if days := raw.Dias.Values(); len(days) > 0 {
			out[id] = days[0].Dia
		}
	}
	return out
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
		var raw domain.LegacyAnimeRaw
		if json.Unmarshal(changed.Payload, &raw) != nil {
			return
		}
		section := ""
		if days := raw.Dias.Values(); len(days) > 0 {
			section = days[0].Dia
		}
		_ = a.seasonService.HandleAnimeWatched(ctx, changed.AnimeID, section, raw.NroCapVisto)
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
	if a.chapterService == nil {
		return SendToVerHoyDTO{Status: "chapter service unavailable"}
	}
	for _, id := range animeIDs {
		if _, err := a.chapterService.SetAnimeDays(a.seasonCtx(), anime.SetAnimeDaysCommand{
			AnimeID: id,
			Dias:    []string{"Ver hoy"},
		}); err != nil {
			return SendToVerHoyDTO{Status: err.Error()}
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
	now := time.Now()
	window := time.Date(now.Year(), now.Month(), now.Day(), scheduled.Hour(), scheduled.Minute(), 0, 0, now.Location())
	return cfg.DailyTimeHHMM, now.After(window)
}

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

func (a *App) triggerDownloadsForSeason(ctx context.Context) {
	if a.downloadScheduler == nil {
		return
	}
	if err := a.downloadScheduler.TriggerNow(ctx, "season-availability"); err != nil &&
		!errors.Is(err, schedule.ErrRunInProgress) && a.sharedLogger != nil {
		a.sharedLogger.Warnf("season", "failed to chain download run after availability: %v", err)
	}
}
