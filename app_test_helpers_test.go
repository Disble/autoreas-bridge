package main

import (
	"context"
	"database/sql"
	"errors"
	"slices"
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
	"autoreas-bridge/internal/observability/eventlog"
	"autoreas-bridge/internal/observability/requestcapture"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

// newAppTestApp creates an application with test runtime dependencies.
func newAppTestApp(t *testing.T) *App {
	t.Helper()

	return &App{
		bootstrapBridgeDB:   func() (*sql.DB, error) { return &sql.DB{}, nil },
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter:     func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:   func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.Store { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
		newCaptureQueue:  func(*sql.DB) captureQueue { return &stubCaptureQueue{} },
		newCaptureReader: func(*sql.DB) *requestcapture.Reader { return nil },
		newEventQueue:    func(*sql.DB) eventLogQueue { return &stubEventLogQueue{} },
	}
}

// containsString reports whether a string slice contains the requested value.
func containsString(items []string, want string) bool {
	return slices.Contains(items, want)
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

type stubAppUpdateWriter struct {
	started    bool
	waitCalled bool
	onWait     func()
}

type stubAppChangelogStore struct{}

type stubAppDeviceStore struct{}

type stubAppHTTPServer struct {
	started    bool
	stopped    bool
	startErr   error
	onShutdown func()
}

type stubAppRealtimeHub struct {
	received      chan events.AnimeChangedEvent
	seasonModes   chan bool
	seasonChanges chan string
}

type stubAppDeviceService struct{}

type stubAppNotifier struct{}

type stubCaptureQueue struct {
	onStop func()
}

// stubEventLogQueue is an eventLogQueue test double that never touches
// SQLite, mirroring stubCaptureQueue -- newAppTestApp's default so tests
// exercising startup/shutdown paths that don't care about event
// persistence never accidentally drive the real eventlog.Queue against a
// bare, unopened *sql.DB{}.
type stubEventLogQueue struct {
	onStop func()
}

func (s *stubEventLogQueue) Stop(context.Context) eventlog.QueueStopResult {
	if s.onStop != nil {
		s.onStop()
	}
	return eventlog.QueueStopResult{}
}

type recordingLifecycleDB struct {
	onClose func()
}

func (*stubAppNotifier) Notify(context.Context, notification.Notification) error { return nil }

func (s *stubCaptureQueue) TryEnqueue(requestcapture.CaptureRecord) bool { return true }

func (s *stubCaptureQueue) Stop(context.Context) requestcapture.QueueStopResult {
	if s.onStop != nil {
		s.onStop()
	}
	return requestcapture.QueueStopResult{}
}

func (s *recordingLifecycleDB) Close() error {
	if s.onClose != nil {
		s.onClose()
	}
	return nil
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

type stubAppEpisodeService struct {
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

func (s *stubAppEpisodeService) ListEpisodeDayCounts(context.Context) ([]anime.EpisodeDayCount, error) {
	return s.dayCounts, s.err
}

func (s *stubAppEpisodeService) ListEpisodeSchedule(_ context.Context, query anime.EpisodeScheduleQuery) ([]anime.EpisodeScheduleItem, error) {
	s.lastDay = query.Day
	return s.schedule, s.err
}

func (s *stubAppEpisodeService) AdjustWatchedEpisodes(_ context.Context, cmd anime.AdjustWatchedEpisodesCommand) (anime.EpisodeCommandResult, error) {
	s.lastAdjust = cmd
	return anime.EpisodeCommandResult{
		AnimeID:     cmd.AnimeID,
		NroCapVisto: cmd.Delta,
		Estado:      0,
	}, s.err
}

func (s *stubAppEpisodeService) SetAnimeState(_ context.Context, cmd anime.SetAnimeStateCommand) (anime.EpisodeCommandResult, error) {
	s.lastState = cmd
	return anime.EpisodeCommandResult{
		AnimeID: cmd.AnimeID,
		Estado:  cmd.Estado,
	}, s.err
}

func (s *stubAppEpisodeService) SetAnimeDays(_ context.Context, cmd anime.SetAnimeDaysCommand) (anime.EpisodeCommandResult, error) {
	s.lastDays = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppEpisodeService) SoftDeleteAnime(_ context.Context, cmd anime.SoftDeleteAnimeCommand) (anime.EpisodeCommandResult, error) {
	s.lastSoftDelete = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppEpisodeService) RestoreAnime(_ context.Context, cmd anime.RestoreAnimeCommand) (anime.EpisodeCommandResult, error) {
	s.lastRestore = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppEpisodeService) RepeatAnime(_ context.Context, cmd anime.RepeatAnimeCommand) (anime.EpisodeCommandResult, error) {
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

func (s *stubAppHTTPServer) Start() error { s.started = true; return s.startErr }
func (s *stubAppHTTPServer) Shutdown(context.Context) error {
	s.stopped = true
	if s.onShutdown != nil {
		s.onShutdown()
	}
	return nil
}
func (*stubAppHTTPServer) Addr() string             { return "127.0.0.1:0" }
func (*stubAppHTTPServer) EffectiveAddress() string { return "192.168.1.50:9876" }

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
	onStop  func()
}

func (s *stubAppUpdateWriter) StartAsync(context.Context) { s.started = true }
func (s *stubAppUpdateWriter) Wait() {
	s.waitCalled = true
	if s.onWait != nil {
		s.onWait()
	}
}
func (s *stubAppUpdateWriter) Err() error { return nil }
func (s *stubAppUpdateWriter) RequestWrite(context.Context, string, []byte) error {
	return nil
}

func (s *stubAppChangelogRecorder) Start(context.Context) { s.started = true }
func (s *stubAppChangelogRecorder) Stop() {
	s.stopped = true
	if s.onStop != nil {
		s.onStop()
	}
}
func (s *stubAppChangelogRecorder) Err() error { return nil }

func (s *stubTracerBulletRunner) Start() { s.started = true }

type stubTraceSink struct{}

func (*stubTraceSink) Record(string) {}
