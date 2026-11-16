package desktop

import (
	"context"
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
func newJDownloaderClient(email, password string) jd.JdClient {
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

// ── Wails bindings ─────────────────────────────────────────────────────────────
//
// Every binding reaches the download services through the downloads module handle, so a
// module that is starting answers unavailable and a failed one failed_precondition.

// bindDownloadsModule binds the downloads module's services once
// startDownloadOrchestration has wired all of them; the module's wiring check fails the
// module when one is missing, so a module that reads ready always finds them.
func (a *App) bindDownloadsModule() {
	if a.downloadStore == nil || a.downloadService == nil || a.readinessService == nil || a.downloadScheduler == nil {
		return
	}
	a.moduleSet().downloads.Bind(downloadServices{
		store:     a.downloadStore,
		service:   a.downloadService,
		readiness: a.readinessService,
		scheduler: a.downloadScheduler,
	})
}

// GetDownloadConfig returns the current JD config, schedule config, and hoster priority
// ordering for the download settings screen. A failed store read is the binding's error.
func (a *App) GetDownloadConfig() (contracts.DownloadConfig, error) {
	return a.moduleSet().downloads.Use(func(s downloadServices) (contracts.DownloadConfig, error) {
		ctx := a.downloadCtx()
		jdCfg, err := s.store.GetJDConfig(ctx)
		if err != nil {
			return contracts.DownloadConfig{}, err
		}
		scheduleCfg, err := s.store.GetScheduleConfig(ctx)
		if err != nil {
			return contracts.DownloadConfig{}, err
		}
		hosterEntries, err := s.store.ListHosterPriority(ctx, config.DefaultHosterPrioritySite)
		if err != nil {
			return contracts.DownloadConfig{}, err
		}
		return contracts.DownloadConfig{
			JD:                 toContractsJDStatus(jdCfg),
			Schedule:           a.toContractsScheduleConfig(scheduleCfg),
			HosterPrioritySite: config.DefaultHosterPrioritySite,
			HosterPriority:     toContractsHosterPriority(hosterEntries),
			RenameEpisodes:     a.episodeRenameEnabled(ctx),
		}, nil
	})
}

// SetHosterPriority persists the user-configured hoster ordering for a site.
func (a *App) SetHosterPriority(site string, entries []contracts.HosterPriorityItem) error {
	_, err := a.moduleSet().downloads.Use(func(s downloadServices) (struct{}, error) {
		domainEntries := make([]download.HosterPriorityEntry, 0, len(entries))
		for _, e := range entries {
			domainEntries = append(domainEntries, download.HosterPriorityEntry{
				Hoster:   e.Hoster,
				Priority: e.Priority,
				Enabled:  e.Enabled,
			})
		}
		return struct{}{}, s.store.SetHosterPriority(a.downloadCtx(), site, domainEntries)
	})
	return err
}

// GetJDStatus returns the current MyJDownloader config/connectivity snapshot.
func (a *App) GetJDStatus() (contracts.JDStatus, error) {
	return a.moduleSet().downloads.Use(func(s downloadServices) (contracts.JDStatus, error) {
		cfg, err := s.store.GetJDConfig(a.downloadCtx())
		if err != nil {
			return contracts.JDStatus{}, err
		}
		return toContractsJDStatus(cfg), nil
	})
}

// SetJDConfig persists MyJDownloader credentials/config. A nil PlaintextPassword leaves the
// existing encrypted blob untouched (design §4.3: edit email/device without re-entering the
// password).
func (a *App) SetJDConfig(input contracts.JDConfigInput) error {
	_, err := a.moduleSet().downloads.Use(func(s downloadServices) (struct{}, error) {
		cfg := download.JDConfig{
			Email:           input.Email,
			DeviceName:      input.DeviceName,
			ExePathOverride: input.ExePathOverride,
			DefaultDestDir:  input.DefaultDestDir,
		}
		return struct{}{}, s.store.SetJDConfig(a.downloadCtx(), cfg, input.PlaintextPassword)
	})
	return err
}

// GetScheduleConfig returns the current scheduler config with the scheduler's live
// running flag overlaid.
func (a *App) GetScheduleConfig() (contracts.ScheduleConfig, error) {
	return a.moduleSet().downloads.Use(func(s downloadServices) (contracts.ScheduleConfig, error) {
		cfg, err := s.store.GetScheduleConfig(a.downloadCtx())
		if err != nil {
			return contracts.ScheduleConfig{}, err
		}
		return a.toContractsScheduleConfig(cfg), nil
	})
}

// SetScheduleConfig persists the scheduler config (mode/daily time/enabled) and tells the
// scheduler to re-plan from the stored value.
func (a *App) SetScheduleConfig(cfg contracts.ScheduleConfig) error {
	_, err := a.moduleSet().downloads.Use(func(s downloadServices) (struct{}, error) {
		domainCfg := download.ScheduleConfig{
			Mode:            cfg.Mode,
			DailyTimeHHMM:   cfg.DailyTimeHHMM,
			Enabled:         cfg.Enabled,
			LastRunAtMs:     cfg.LastRunAtMs,
			LastRunStatus:   cfg.LastRunStatus,
			NextRunAtMs:     cfg.NextRunAtMs,
			EnabledWeekdays: byte(cfg.EnabledWeekdays),
		}
		if err := s.store.SetScheduleConfig(a.downloadCtx(), domainCfg); err != nil {
			return struct{}{}, err
		}
		s.scheduler.NotifyConfigChanged()
		return struct{}{}, nil
	})
	return err
}

// ListDownloadRuns returns the most recent download_runs rows for the run-history view.
func (a *App) ListDownloadRuns() ([]contracts.DownloadRunView, error) {
	return a.moduleSet().downloads.Use(func(s downloadServices) ([]contracts.DownloadRunView, error) {
		runs, err := s.store.ListRuns(a.downloadCtx(), 0)
		if err != nil {
			return nil, err
		}
		out := make([]contracts.DownloadRunView, 0, len(runs))
		for _, run := range runs {
			out = append(out, toContractsDownloadRunView(run))
		}
		return out, nil
	})
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
