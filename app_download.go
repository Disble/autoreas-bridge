package main

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/schedule"
	jd "github.com/Disble/jdownloader-go/jdownloader"
)

// reconfigurableJDClient wraps the real jdownloader.JDClient adapter behind a lazily
// (re)built client, since MyJDownloader credentials (email/password) can change at runtime
// via SetJDConfig and jd.NewClient bakes credentials in at construction time (the
// rkosegi/jdownloader-go client has no SetCredentials method). configHash tracks the
// email+device pair the current inner client was built from, so a config change forces a
// rebuild on the next call rather than silently reusing stale credentials.
type reconfigurableJDClient struct {
	store download.Store

	mu           sync.Mutex
	inner        jdownloader.JDClient
	configEmail  string
	configDevice string
}

// newReconfigurableJDClient returns a jdownloader.JDClient that rebuilds its underlying real
// adapter from the store's current JDConfig/DecryptedPassword whenever the configured
// email/device pair changes (composition-root-only wiring, SDD-28 design.md §4.3/§7, PR4b
// Phase 6). A nil store degrades every call to ErrJDConfigUnavailable rather than panicking.
func newReconfigurableJDClient(store download.Store) jdownloader.JDClient {
	return &reconfigurableJDClient{store: store}
}

// client returns the cached JDownloader client or rebuilds it from current credentials.
func (c *reconfigurableJDClient) client(ctx context.Context) (jdownloader.JDClient, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.store == nil {
		return nil, errJDConfigUnavailable
	}

	cfg, err := c.store.GetJDConfig(ctx)
	if err != nil {
		return nil, err
	}

	if c.inner != nil && c.configEmail == cfg.Email && c.configDevice == cfg.DeviceName {
		return c.inner, nil
	}

	password, _, err := c.store.DecryptedPassword(ctx)
	if err != nil {
		return nil, err
	}

	launcher := jdownloader.NewExeLauncher()
	client := newJDownloaderClient(cfg.Email, password)
	c.inner = jdownloader.New(client, launcher)
	c.configEmail = cfg.Email
	c.configDevice = cfg.DeviceName
	return c.inner, nil
}

// newJDownloaderClient constructs the underlying JDownloader API client.
func newJDownloaderClient(email string, password string) jd.JdClient {
	return jd.NewClient(email, password, slog.New(slog.DiscardHandler))
}

func (c *reconfigurableJDClient) Connect(ctx context.Context) error {
	inner, err := c.client(ctx)
	if err != nil {
		return err
	}
	return inner.Connect(ctx)
}

func (c *reconfigurableJDClient) ListDevices(ctx context.Context) ([]jdownloader.DeviceStatus, error) {
	inner, err := c.client(ctx)
	if err != nil {
		return nil, err
	}
	return inner.ListDevices(ctx)
}

func (c *reconfigurableJDClient) EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error {
	inner, err := c.client(ctx)
	if err != nil {
		return err
	}
	return inner.EnsureOnline(ctx, deviceName, launchIfMissing)
}

func (c *reconfigurableJDClient) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	inner, err := c.client(ctx)
	if err != nil {
		return err
	}
	return inner.AddAndStart(ctx, deviceName, req)
}

func (c *reconfigurableJDClient) PackageStatusByDestination(ctx context.Context, deviceName, destination string) (jdownloader.DestinationStatus, error) {
	inner, err := c.client(ctx)
	if err != nil {
		return jdownloader.DestinationStatus{}, err
	}
	return inner.PackageStatusByDestination(ctx, deviceName, destination)
}

func (c *reconfigurableJDClient) RenameEpisodeByDestination(ctx context.Context, deviceName, destination, baseName string) (string, error) {
	inner, err := c.client(ctx)
	if err != nil {
		return "", err
	}
	return inner.RenameEpisodeByDestination(ctx, deviceName, destination, baseName)
}

func (c *reconfigurableJDClient) RemoveByDestination(ctx context.Context, deviceName, destination string) error {
	inner, err := c.client(ctx)
	if err != nil {
		return err
	}
	return inner.RemoveByDestination(ctx, deviceName, destination)
}

func (c *reconfigurableJDClient) Disconnect(ctx context.Context) error {
	inner, err := c.client(ctx)
	if err != nil {
		return err
	}
	return inner.Disconnect(ctx)
}

var _ jdownloader.JDClient = (*reconfigurableJDClient)(nil)

// errJDConfigUnavailable is returned by every reconfigurableJDClient call when the backing
// store is nil (download orchestration not wired, e.g. bridgeDB unavailable at startup).
var errJDConfigUnavailable = errJDConfigUnavailableErr{}

type errJDConfigUnavailableErr struct{}

func (errJDConfigUnavailableErr) Error() string { return "download: JD config store unavailable" }

// ── Wails bindings (SDD-28 PR4b Phase 6, tasks 6.11/6.12) ──────────────────────
//
// Every binding degrades gracefully (never panics) when downloadStore/downloadService/
// downloadScheduler is nil, mirroring the existing GetPairingToken/GetSyncingAnimeItems
// nil-degradation convention in app.go.

// emptyDownloadConfig returns the safe empty download configuration.
func emptyDownloadConfig() contracts.DownloadConfig {
	return contracts.DownloadConfig{
		HosterPrioritySite: config.DefaultHosterPrioritySite,
		HosterPriority:     []contracts.HosterPriorityItem{},
	}
}

// GetDownloadConfig returns the current JD config, schedule config, and hoster priority
// ordering for the download settings screen. Degrades to a zero-value DownloadConfig when the
// download store is unavailable.
func (a *App) GetDownloadConfig() contracts.DownloadConfig {
	if a.downloadStore == nil {
		return emptyDownloadConfig()
	}

	ctx := a.downloadCtx()

	jdCfg, err := a.downloadStore.GetJDConfig(ctx)
	if err != nil {
		return emptyDownloadConfig()
	}

	scheduleCfg, err := a.downloadStore.GetScheduleConfig(ctx)
	if err != nil {
		return emptyDownloadConfig()
	}

	hosterEntries, _ := a.downloadStore.ListHosterPriority(ctx, config.DefaultHosterPrioritySite)

	return contracts.DownloadConfig{
		JD:                 toContractsJDStatus(jdCfg),
		Schedule:           a.toContractsScheduleConfig(scheduleCfg),
		HosterPrioritySite: config.DefaultHosterPrioritySite,
		HosterPriority:     toContractsHosterPriority(hosterEntries),
		RenameEpisodes:     a.episodeRenameEnabled(ctx),
	}
}

// SetHosterPriority persists the user-configured hoster ordering for a site. Returns "ok" on
// success or an error string when the store is unavailable or the write fails.
func (a *App) SetHosterPriority(site string, entries []contracts.HosterPriorityItem) string {
	if a.downloadStore == nil {
		return "download store unavailable"
	}

	domainEntries := make([]download.HosterPriorityEntry, 0, len(entries))
	for _, e := range entries {
		domainEntries = append(domainEntries, download.HosterPriorityEntry{
			Hoster:   e.Hoster,
			Priority: e.Priority,
			Enabled:  e.Enabled,
		})
	}

	if err := a.downloadStore.SetHosterPriority(a.downloadCtx(), site, domainEntries); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetJDStatus returns the current MyJDownloader config/connectivity snapshot. Degrades to a
// zero-value JDStatus when the download store is unavailable.
func (a *App) GetJDStatus() contracts.JDStatus {
	if a.downloadStore == nil {
		return contracts.JDStatus{}
	}
	cfg, err := a.downloadStore.GetJDConfig(a.downloadCtx())
	if err != nil {
		return contracts.JDStatus{}
	}
	return toContractsJDStatus(cfg)
}

// SetJDConfig persists MyJDownloader credentials/config. A nil PlaintextPassword leaves the
// existing encrypted blob untouched (design §4.3 "edit email/device without re-entering
// password"). Returns "ok" on success or an error string when the store is unavailable or the
// write fails.
func (a *App) SetJDConfig(input contracts.JDConfigInput) string {
	if a.downloadStore == nil {
		return "download store unavailable"
	}

	cfg := download.JDConfig{
		Email:           input.Email,
		DeviceName:      input.DeviceName,
		ExePathOverride: input.ExePathOverride,
		DefaultDestDir:  input.DefaultDestDir,
	}

	if err := a.downloadStore.SetJDConfig(a.downloadCtx(), cfg, input.PlaintextPassword); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetScheduleConfig returns the current scheduler config, overlaying the live "running" flag
// from the scheduler itself when available. Degrades to a zero-value ScheduleConfig when the
// download store is unavailable.
func (a *App) GetScheduleConfig() contracts.ScheduleConfig {
	if a.downloadStore == nil {
		return contracts.ScheduleConfig{}
	}
	cfg, err := a.downloadStore.GetScheduleConfig(a.downloadCtx())
	if err != nil {
		return contracts.ScheduleConfig{}
	}
	return a.toContractsScheduleConfig(cfg)
}

// SetScheduleConfig persists the scheduler config (mode/daily time/enabled). Returns "ok" on
// success or an error string when the store is unavailable or the write fails.
func (a *App) SetScheduleConfig(cfg contracts.ScheduleConfig) string {
	if a.downloadStore == nil {
		return "download store unavailable"
	}

	domainCfg := download.ScheduleConfig{
		Mode:            cfg.Mode,
		DailyTimeHHMM:   cfg.DailyTimeHHMM,
		Enabled:         cfg.Enabled,
		LastRunAtMs:     cfg.LastRunAtMs,
		LastRunStatus:   cfg.LastRunStatus,
		NextRunAtMs:     cfg.NextRunAtMs,
		EnabledWeekdays: byte(cfg.EnabledWeekdays),
	}

	if err := a.downloadStore.SetScheduleConfig(a.downloadCtx(), domainCfg); err != nil {
		return err.Error()
	}
	if a.downloadScheduler != nil {
		a.downloadScheduler.NotifyConfigChanged()
	}
	return "ok"
}

// RunMissedScheduleNow executes the startup-missed selected date under the scheduler's run guard.
func (a *App) RunMissedScheduleNow(localDate string) contracts.ScheduleMissedActionResult {
	if a.downloadScheduler == nil {
		return contracts.ScheduleMissedActionResult{Kind: string(schedule.MissedStartupActionError), LocalDate: localDate, Message: "download scheduler unavailable"}
	}
	return toContractsMissedActionResult(a.downloadScheduler.ResolveMissedStartupDate(a.downloadCtx(), localDate, schedule.MissedStartupActionRunNow))
}

// IgnoreMissedSchedule settles the startup-missed selected date without rewriting actual run facts.
func (a *App) IgnoreMissedSchedule(localDate string) contracts.ScheduleMissedActionResult {
	if a.downloadScheduler == nil {
		return contracts.ScheduleMissedActionResult{Kind: string(schedule.MissedStartupActionError), LocalDate: localDate, Message: "download scheduler unavailable"}
	}
	return toContractsMissedActionResult(a.downloadScheduler.ResolveMissedStartupDate(a.downloadCtx(), localDate, schedule.MissedStartupActionIgnore))
}

// TriggerDownloadCheck asks the scheduler to run an immediate out-of-band download check.
// Returns "ok" on success, a descriptive string if the scheduler is unavailable, or surfaces
// schedule.ErrRunInProgress's message when a run (scheduled or manual) is already active
// (design-scheduler spec "Concurrent-Run Guard").
func (a *App) TriggerDownloadCheck() string {
	if a.downloadScheduler == nil {
		return "download scheduler unavailable"
	}
	if err := a.downloadScheduler.TriggerNow(a.downloadCtx(), "manual"); err != nil {
		return err.Error()
	}
	return "ok"
}

// TriggerAnimeDownload starts a background catch-up run for one selected anime. It reuses the
// download Service's normal run-history/events path, but scopes candidate selection to the anime
// id chosen by the Downloads UI instead of today's schedule/season-mode set.
func (a *App) TriggerAnimeDownload(animeID string) string {
	if a.animeQuery == nil {
		return "anime query unavailable"
	}
	if a.downloadService == nil {
		return "download service unavailable"
	}
	if a.downloadScheduler != nil && a.downloadScheduler.Status(a.downloadCtx()).Running {
		return schedule.ErrRunInProgress.Error()
	}
	if !a.soloDownloadMu.TryLock() {
		return schedule.ErrRunInProgress.Error()
	}

	anime, err := a.animeQuery.GetMobileAnime(a.downloadCtx(), animeID)
	if err != nil {
		a.soloDownloadMu.Unlock()
		return err.Error()
	}
	if anime == nil {
		a.soloDownloadMu.Unlock()
		return "anime not found"
	}

	// The solo run is owned by the App, not the scheduler, so it needs its own
	// cancel for CancelDownloadRun to be able to stop it.
	runCtx, cancel := context.WithCancel(a.downloadCtx())
	a.setSoloDownloadCancel(cancel)

	go func(selected contracts.MobileAnime) {
		defer a.soloDownloadMu.Unlock()
		defer a.clearSoloDownloadCancel()
		defer cancel()
		_, _ = a.downloadService.RunAnime(runCtx, "manual_anime", selected)
	}(*anime)

	return "ok"
}

// ListDownloadRuns returns the most recent download_runs rows for the run-history view.
// Degrades to an empty slice when the download store is unavailable.
func (a *App) ListDownloadRuns() []contracts.DownloadRunView {
	if a.downloadStore == nil {
		return []contracts.DownloadRunView{}
	}

	runs, err := a.downloadStore.ListRuns(a.downloadCtx(), 0)
	if err != nil {
		return []contracts.DownloadRunView{}
	}

	out := make([]contracts.DownloadRunView, 0, len(runs))
	for _, run := range runs {
		out = append(out, toContractsDownloadRunView(run))
	}
	return out
}

// ListDownloadReadiness returns the current local readiness snapshot. Query failures are
// returned to Wails so the frontend cannot mistake an unavailable snapshot for an empty catalog.
func (a *App) ListDownloadReadiness() (contracts.DownloadReadinessSnapshot, error) {
	if a.readinessService == nil {
		// Logged, not just returned: a nil service means startup never reached
		// startDownloadOrchestration, and without this line the failure is
		// invisible on both sides -- Wails rejects with a bare string and the
		// UI used to replace it with a generic sentence.
		a.logReadinessFailure("download readiness service was never wired during startup")
		return contracts.DownloadReadinessSnapshot{}, errors.New("download readiness unavailable: service not wired at startup")
	}
	snapshot, err := a.readinessService.BuildSnapshot(a.downloadCtx())
	if err != nil {
		a.logReadinessFailure(err.Error())
		return contracts.DownloadReadinessSnapshot{}, err
	}
	return snapshot, nil
}

// logReadinessFailure records why a readiness snapshot could not be built, so the
// cause survives even when the caller only shows a generic message.
func (a *App) logReadinessFailure(reason string) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Warnf("download", "list download readiness failed: %s", reason)
}

// downloadCtx returns a.ctx, falling back to context.Background() before startup has set it
// (mirrors the existing GetSQLiteStatus/GetPairingToken convention in app.go).
func (a *App) downloadCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

// toContractsScheduleConfig overlays the live scheduler "running" flag (when a scheduler is
// wired) onto the persisted ScheduleConfig (design-scheduler spec "Next-Run/Last-Run/Last-
// Status Surfaced").
func (a *App) toContractsScheduleConfig(cfg download.ScheduleConfig) contracts.ScheduleConfig {
	running := false
	if a.downloadScheduler != nil {
		running = a.downloadScheduler.Status(a.downloadCtx()).Running
	}
	var missedNotice *contracts.ScheduleMissedNotice
	if notice := schedule.EvaluateStartupMissedSelectedDay(schedule.StartupMissedSelectedDayInput{
		Now:              a.currentTime(),
		ProcessStartedAt: a.processStartedAt,
		Config:           cfg,
	}); notice != nil {
		missedNotice = &contracts.ScheduleMissedNotice{
			LocalDate:     notice.LocalDate,
			DueAtMs:       notice.DueAtMs,
			AttemptStatus: notice.AttemptStatus,
		}
	}
	return contracts.ScheduleConfig{
		Mode:            cfg.Mode,
		DailyTimeHHMM:   cfg.DailyTimeHHMM,
		Enabled:         cfg.Enabled,
		LastRunAtMs:     cfg.LastRunAtMs,
		LastRunStatus:   cfg.LastRunStatus,
		NextRunAtMs:     cfg.NextRunAtMs,
		Running:         running,
		EnabledWeekdays: int(cfg.EnabledWeekdays),
		MissedNotice:    missedNotice,
	}
}

// toContractsMissedActionResult maps a scheduler missed-startup action result to the
// contracts DTOs used by the Wails binding surface.
func toContractsMissedActionResult(result schedule.MissedStartupActionResult) contracts.ScheduleMissedActionResult {
	return contracts.ScheduleMissedActionResult{
		Kind:             string(result.Kind),
		LocalDate:        result.LocalDate,
		TerminalStatus:   result.TerminalStatus,
		SettlementReason: string(result.SettlementReason),
		Message:          result.Message,
	}
}
