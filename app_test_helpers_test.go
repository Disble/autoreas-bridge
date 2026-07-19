package main

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/cover"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

// newAppTestApp creates an application with test runtime dependencies.
func newAppTestApp(t *testing.T) *App {
	t.Helper()

	return &App{
		bootstrapBridgeDB:    func() (*sql.DB, error) { return &sql.DB{}, nil },
		resolveAnimeDataPath: func() (string, error) { return filepath.Join(t.TempDir(), "animes.dat"), nil },
		newSnapshotParser:    func() anime.SnapshotParser { return &stubAppParser{} },
		newSnapshotStore:     func(*sql.DB) anime.SnapshotStore { return &stubAppStore{} },
		newStartupCoordinator: func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
			return &stubAppCoordinator{}
		},
		newRuntimeWatcher: func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newBridgeNativeRegistry: func(*sql.DB) anime.BridgeNativeRegistry {
			return &stubAppBridgeNativeRegistry{}
		},
		// restoreBridgeNativeAnimes is a fully swappable hook precisely so
		// tests using a fake/zero-value *sql.DB (wantDB := &sql.DB{}) never
		// touch a real bridge DB during startup(). Tests exercising the
		// real repair set this explicitly.
		restoreBridgeNativeAnimes: func(context.Context) error { return nil },
		newSelfEchoRegistry:       anime.NewSelfEchoRegistry,
		newUpdateWriter:           func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:         func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.Store { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
	}
}

// containsString reports whether a string slice contains the requested value.
func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

type recordingSharedAppLogger struct {
	entries []string
}

func (l *recordingSharedAppLogger) Debugf(domain, format string, args ...any) {}
func (l *recordingSharedAppLogger) Infof(domain, format string, args ...any) {
	l.entries = append(l.entries, format)
}
func (l *recordingSharedAppLogger) Warnf(domain, format string, args ...any)  {}
func (l *recordingSharedAppLogger) Errorf(domain, format string, args ...any) {}
func (l *recordingSharedAppLogger) Logf(domain, level string, fields sharedlogger.Fields, format string, args ...any) {
	l.entries = append(l.entries, format)
}

type stubAppCoordinator struct {
	started    chan context.Context
	waitCalled bool
}

type trayLifecycleTestApp struct {
	*App
	hideWindowCalls       int
	showWindowCalls       int
	unminimiseWindowCalls int
	quitCalls             int
	lastHiddenContext     context.Context
}

// newTrayLifecycleTestApp creates an application with observable tray hooks.
func newTrayLifecycleTestApp(t *testing.T, manager *tray.MockTrayManager) *trayLifecycleTestApp {
	t.Helper()

	base := newAppTestApp(t)
	base.newTrayManager = func() tray.Manager { return manager }

	app := &trayLifecycleTestApp{App: base}
	base.hideWindow = func(ctx context.Context) {
		app.hideWindowCalls++
		app.lastHiddenContext = ctx
	}
	base.showWindow = func(context.Context) { app.showWindowCalls++ }
	base.unminimiseWindow = func(context.Context) { app.unminimiseWindowCalls++ }
	base.quitApp = func(context.Context) { app.quitCalls++ }

	return app
}

type stubTracerBulletRunner struct{ started bool }

type stubAppRuntimeWatcher struct {
	started    bool
	waitCalled bool
}

type stubAppUpdateWriter struct {
	started    bool
	waitCalled bool
}

type stubAppChangelogStore struct{}

type stubAppDeviceStore struct{}

type stubAppHTTPServer struct {
	started  bool
	stopped  bool
	startErr error
}

type stubAppRealtimeHub struct {
	received      chan events.AnimeChangedEvent
	seasonModes   chan bool
	seasonChanges chan string
}

type stubAppDeviceService struct{}

type stubAppNotifier struct{}

func (*stubAppNotifier) Notify(context.Context, notification.Notification) error { return nil }

type stubAnimeLegacyPullService struct {
	result contracts.AnimeLegacyPullResult
	calls  int
}

func (s *stubAnimeLegacyPullService) Pull(context.Context) contracts.AnimeLegacyPullResult {
	s.calls++
	return s.result
}

// stubAnimeQueryService is a minimal contracts.AnimeQueryService double for
// app_runtime_test.go's GetAnimeDetail cases. Only GetMobileAnime is
// exercised by those tests; the other methods return zero values.
type stubAnimeQueryService struct {
	mobileAnime  *contracts.MobileAnime
	mobileAnimes []contracts.MobileAnime
	err          error
	history      []contracts.AnimeHistoryItem
	historyErr   error
}

func (s *stubAnimeQueryService) GetEffectiveAnime(context.Context, string) (*contracts.EffectiveAnime, error) {
	return nil, nil
}

func (s *stubAnimeQueryService) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return s.mobileAnimes, s.err
}

func (s *stubAnimeQueryService) GetMobileAnime(context.Context, string) (*contracts.MobileAnime, error) {
	return s.mobileAnime, s.err
}

func (s *stubAnimeQueryService) ListAnimeItems(context.Context) ([]contracts.AnimeListItem, error) {
	return nil, nil
}

func (s *stubAnimeQueryService) ListAnimeHistory(context.Context) ([]contracts.AnimeHistoryItem, error) {
	return s.history, s.historyErr
}

func (s *stubAnimeQueryService) GetAnimeDetail(context.Context, string) (*contracts.AnimeDetail, error) {
	return nil, nil
}

var _ contracts.AnimeQueryService = (*stubAnimeQueryService)(nil)

// stubAppCoverResolver is a coverResolver double for app_runtime_test.go's
// GetAnimeCover cases: records the last (animeID, portadaPath) it was
// called with and returns a canned cover.Result.
type stubAppCoverResolver struct {
	result      cover.Result
	lastAnimeID string
	lastPortada string
}

func (s *stubAppCoverResolver) Resolve(_ context.Context, animeID, portadaPath string) cover.Result {
	s.lastAnimeID = animeID
	s.lastPortada = portadaPath
	return s.result
}

type stubAppChapterService struct {
	schedule       []anime.EpisodeScheduleItem
	dayCounts      []anime.EpisodeDayCount
	lastDay        string
	lastAdjust     anime.AdjustWatchedEpisodesCommand
	lastState      anime.SetAnimeStateCommand
	lastDays       anime.SetAnimeDaysCommand
	lastSoftDelete anime.SoftDeleteAnimeCommand
	lastRestore    anime.RestoreAnimeCommand
	lastRepeat     anime.RepeatAnimeCommand
	err            error
}

func (s *stubAppChapterService) ListEpisodeDayCounts(context.Context) ([]anime.EpisodeDayCount, error) {
	return s.dayCounts, s.err
}

func (s *stubAppChapterService) ListEpisodeSchedule(_ context.Context, query anime.EpisodeScheduleQuery) ([]anime.EpisodeScheduleItem, error) {
	s.lastDay = query.Day
	return s.schedule, s.err
}

func (s *stubAppChapterService) AdjustWatchedEpisodes(_ context.Context, cmd anime.AdjustWatchedEpisodesCommand) (anime.EpisodeCommandResult, error) {
	s.lastAdjust = cmd
	return anime.EpisodeCommandResult{
		AnimeID:     cmd.AnimeID,
		NroCapVisto: cmd.Delta,
		Estado:      0,
	}, s.err
}

func (s *stubAppChapterService) SetAnimeState(_ context.Context, cmd anime.SetAnimeStateCommand) (anime.EpisodeCommandResult, error) {
	s.lastState = cmd
	return anime.EpisodeCommandResult{
		AnimeID: cmd.AnimeID,
		Estado:  cmd.Estado,
	}, s.err
}

func (s *stubAppChapterService) SetAnimeDays(_ context.Context, cmd anime.SetAnimeDaysCommand) (anime.EpisodeCommandResult, error) {
	s.lastDays = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppChapterService) SoftDeleteAnime(_ context.Context, cmd anime.SoftDeleteAnimeCommand) (anime.EpisodeCommandResult, error) {
	s.lastSoftDelete = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppChapterService) RestoreAnime(_ context.Context, cmd anime.RestoreAnimeCommand) (anime.EpisodeCommandResult, error) {
	s.lastRestore = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppChapterService) RepeatAnime(_ context.Context, cmd anime.RepeatAnimeCommand) (anime.EpisodeCommandResult, error) {
	s.lastRepeat = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

type recordingAppNotifier struct{ received []notification.Notification }

func (n *recordingAppNotifier) Notify(_ context.Context, notif notification.Notification) error {
	n.received = append(n.received, notif)
	return nil
}

type erroringAppNotifier struct{}

func (*erroringAppNotifier) Notify(context.Context, notification.Notification) error {
	return errors.New("notify boom")
}

func (*stubAppChangelogStore) InsertPending(context.Context, bridgeSync.ChangelogEntry) error {
	return nil
}

func (*stubAppDeviceStore) SavePairingToken(context.Context, string, int64) error { return nil }
func (*stubAppDeviceStore) ConsumePairingToken(context.Context, string, int64, int64) error {
	return nil
}
func (*stubAppDeviceStore) FindActivePairingToken(context.Context, int64) (string, error) {
	return "", device.ErrInvalidPairingToken
}
func (*stubAppDeviceStore) PruneExpiredPairingTokens(context.Context, int64) (int64, error) {
	return 0, nil
}
func (*stubAppDeviceStore) InsertPairedDevice(context.Context, device.StoredDevice) error { return nil }
func (*stubAppDeviceStore) FindByAuthToken(context.Context, string) (device.StoredDevice, error) {
	return device.StoredDevice{}, nil
}
func (*stubAppDeviceStore) ListPairedDevices(context.Context) ([]device.StoredDevice, error) {
	return nil, nil
}
func (*stubAppDeviceStore) DeletePairedDevice(context.Context, string) error { return nil }

func (stubAppDeviceService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}
func (stubAppDeviceService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}
func (stubAppDeviceService) ListDevices(context.Context) ([]contracts.DeviceInfo, error) {
	return nil, nil
}
func (stubAppDeviceService) RevokeDevice(context.Context, string) error { return nil }

func (s *stubAppHTTPServer) Start() error                   { s.started = true; return s.startErr }
func (s *stubAppHTTPServer) Shutdown(context.Context) error { s.stopped = true; return nil }
func (*stubAppHTTPServer) Addr() string                     { return "127.0.0.1:0" }
func (*stubAppHTTPServer) EffectiveAddress() string         { return "192.168.1.50:8080" }

func (*stubAppRealtimeHub) Register(context.Context, realtime.Client) error { return nil }
func (*stubAppRealtimeHub) Unregister(string)                               {}
func (s *stubAppRealtimeHub) BroadcastAnimeChanged(_ context.Context, event events.AnimeChangedEvent) {
	s.received <- event
}
func (s *stubAppRealtimeHub) BroadcastPreferencesChanged(_ context.Context, seasonMode bool) {
	if s.seasonModes != nil {
		s.seasonModes <- seasonMode
	}
}
func (s *stubAppRealtimeHub) BroadcastSeasonChanged(_ context.Context, _, status string) {
	if s.seasonChanges != nil {
		s.seasonChanges <- status
	}
}
func (*stubAppRealtimeHub) Close() error { return nil }

type stubAppChangelogRecorder struct {
	started bool
	stopped bool
}

func (s *stubAppRuntimeWatcher) StartAsync(context.Context) { s.started = true }
func (s *stubAppRuntimeWatcher) Wait()                      { s.waitCalled = true }
func (s *stubAppRuntimeWatcher) Err() error                 { return nil }

func (s *stubAppUpdateWriter) StartAsync(context.Context) { s.started = true }
func (s *stubAppUpdateWriter) Wait()                      { s.waitCalled = true }
func (s *stubAppUpdateWriter) Err() error                 { return nil }
func (s *stubAppUpdateWriter) RequestWrite(context.Context, string, []byte) error {
	return nil
}

func (s *stubAppChangelogRecorder) Start(context.Context) { s.started = true }
func (s *stubAppChangelogRecorder) Stop()                 { s.stopped = true }
func (s *stubAppChangelogRecorder) Err() error            { return nil }

func (s *stubTracerBulletRunner) Start() { s.started = true }

type stubTraceSink struct{}

func (*stubTraceSink) Record(string) {}

func (s *stubAppCoordinator) StartAsync(ctx context.Context) {
	if s.started != nil {
		s.started <- ctx
	}
}
func (s *stubAppCoordinator) Wait() {
	s.waitCalled = true
}

func (s *stubAppCoordinator) Err() error {
	return nil
}

func (s *stubAppCoordinator) ContextErr() error {
	return nil
}

type stubAppParser struct{}

func (stubAppParser) Parse(io.Reader) (map[string]anime.SnapshotRecord, []anime.ParseWarning, error) {
	return nil, nil, nil
}
