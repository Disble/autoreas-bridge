package main

import (
	"context"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/download/jdownloader"
	jd "github.com/rkosegi/jdownloader-go/jdownloader"
	"go.uber.org/zap"
)

// reconfigurableJDClient wraps the real jdownloader.JDClient adapter behind a lazily
// (re)built client, since MyJDownloader credentials (email/password) can change at runtime
// via SetJDConfig and jd.NewClient bakes credentials in at construction time (the
// rkosegi/jdownloader-go client has no SetCredentials method). configHash tracks the
// email+device pair the current inner client was built from, so a config change forces a
// rebuild on the next call rather than silently reusing stale credentials.
type reconfigurableJDClient struct {
	store download.DownloadStore

	mu           sync.Mutex
	inner        jdownloader.JDClient
	configEmail  string
	configDevice string
}

// newReconfigurableJDClient returns a jdownloader.JDClient that rebuilds its underlying real
// adapter from the store's current JDConfig/DecryptedPassword whenever the configured
// email/device pair changes (composition-root-only wiring, SDD-28 design.md §4.3/§7, PR4b
// Phase 6). A nil store degrades every call to ErrJDConfigUnavailable rather than panicking.
func newReconfigurableJDClient(store download.DownloadStore) jdownloader.JDClient {
	return &reconfigurableJDClient{store: store}
}

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

func newJDownloaderClient(email string, password string) jd.JdClient {
	return jd.NewClient(email, password, zap.NewNop().Sugar())
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

func (c *reconfigurableJDClient) PackagesFinished(ctx context.Context, deviceName string) (bool, error) {
	inner, err := c.client(ctx)
	if err != nil {
		return false, err
	}
	return inner.PackagesFinished(ctx, deviceName)
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

// GetDownloadConfig returns the current JD config, schedule config, and hoster priority
// ordering for the download settings screen. Degrades to a zero-value DownloadConfig when the
// download store is unavailable.
func (a *App) GetDownloadConfig() contracts.DownloadConfig {
	if a.downloadStore == nil {
		return contracts.DownloadConfig{}
	}

	ctx := a.downloadCtx()

	jdCfg, err := a.downloadStore.GetJDConfig(ctx)
	if err != nil {
		return contracts.DownloadConfig{}
	}

	scheduleCfg, err := a.downloadStore.GetScheduleConfig(ctx)
	if err != nil {
		return contracts.DownloadConfig{}
	}

	hosterEntries, _ := a.downloadStore.ListHosterPriority(ctx, "jkanime")

	return contracts.DownloadConfig{
		JD:             toContractsJDStatus(jdCfg),
		Schedule:       a.toContractsScheduleConfig(scheduleCfg),
		HosterPriority: toContractsHosterPriority(hosterEntries),
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
	return contracts.ScheduleConfig{
		Mode:            cfg.Mode,
		DailyTimeHHMM:   cfg.DailyTimeHHMM,
		Enabled:         cfg.Enabled,
		LastRunAtMs:     cfg.LastRunAtMs,
		LastRunStatus:   cfg.LastRunStatus,
		NextRunAtMs:     cfg.NextRunAtMs,
		Running:         running,
		EnabledWeekdays: int(cfg.EnabledWeekdays),
	}
}

func toContractsJDStatus(cfg download.JDConfig) contracts.JDStatus {
	return contracts.JDStatus{
		Email:           cfg.Email,
		HasPassword:     cfg.HasPassword,
		DeviceName:      cfg.DeviceName,
		ExePathOverride: cfg.ExePathOverride,
		DefaultDestDir:  cfg.DefaultDestDir,
		LastSeenStatus:  cfg.LastSeenStatus,
		LastSeenAtMs:    cfg.LastSeenAtMs,
		LastDecryptErr:  cfg.LastDecryptError,
	}
}

func toContractsHosterPriority(entries []download.HosterPriorityEntry) []contracts.HosterPriorityItem {
	out := make([]contracts.HosterPriorityItem, 0, len(entries))
	for _, e := range entries {
		out = append(out, contracts.HosterPriorityItem{
			Hoster:   e.Hoster,
			Priority: e.Priority,
			Enabled:  e.Enabled,
		})
	}
	return out
}

func toContractsManualLinks(links []download.ManualLink) []contracts.ManualLink {
	out := make([]contracts.ManualLink, 0, len(links))
	for _, l := range links {
		out = append(out, contracts.ManualLink{
			Anime:   l.Anime,
			Episode: l.Episode,
			Links:   l.Links,
		})
	}
	return out
}

func toContractsDownloadRunView(run download.DownloadRun) contracts.DownloadRunView {
	return contracts.DownloadRunView{
		RunID:              run.RunID,
		StartedAtMs:        run.StartedAtMs,
		FinishedAtMs:       run.FinishedAtMs,
		Trigger:            run.Trigger,
		AnimesChecked:      run.AnimesChecked,
		EpisodesFound:      run.EpisodesFound,
		EpisodesDownloaded: run.EpisodesDownloaded,
		EpisodesFailed:     run.EpisodesFailed,
		SkippedCount:       run.SkippedCount,
		JDAvailable:        run.JDAvailable,
		Status:             run.Status,
		ErrorSummary:       run.ErrorSummary,
		ManualLinks:        toContractsManualLinks(run.ManualLinks),
	}
}
