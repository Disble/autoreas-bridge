package main

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/hex"
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
	"autoreas-bridge/internal/download/schedule"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/tray"
)

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
		newRuntimeWatcher:   func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher { return &stubAppRuntimeWatcher{} },
		newSelfEchoRegistry: anime.NewSelfEchoRegistry,
		newUpdateWriter:     func(anime.UpdateWriterConfig) anime.UpdateWriter { return &stubAppUpdateWriter{} },
		newChangelogStore:   func(*sql.DB) changelogPendingStore { return &stubAppChangelogStore{} },
		newChangelogRecorder: func(events.Bus, changelogPendingStore, ...sharedlogger.Logger) changelogRecorder {
			return &stubAppChangelogRecorder{}
		},
		newDeviceStore:   func(*sql.DB) device.Store { return &stubAppDeviceStore{} },
		newDeviceService: func(device.Store) device.AuthService { return stubAppDeviceService{} },
		newDownloadStore: func(*sql.DB) download.DownloadStore { return &fakeAppDownloadStore{} },
		newHTTPServer:    func(api.Config) api.Server { return &stubAppHTTPServer{} },
	}
}

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

func newTrayLifecycleTestApp(t *testing.T, manager *tray.MockTrayManager) *trayLifecycleTestApp {
	t.Helper()

	base := newAppTestApp(t)
	base.newTrayManager = func() tray.TrayManager { return manager }

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
	started bool
	stopped bool
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
	mobileAnime *contracts.MobileAnime
	err         error
	history     []contracts.AnimeHistoryItem
	historyErr  error
}

func (s *stubAnimeQueryService) GetEffectiveAnime(context.Context, string) (*contracts.EffectiveAnime, error) {
	return nil, nil
}

func (s *stubAnimeQueryService) ListMobileAnimes(context.Context) ([]contracts.MobileAnime, error) {
	return nil, nil
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
	schedule       []anime.ChapterScheduleItem
	dayCounts      []anime.ChapterDayCount
	lastDay        string
	lastAdjust     anime.AdjustWatchedChaptersCommand
	lastState      anime.SetAnimeStateCommand
	lastSoftDelete anime.SoftDeleteAnimeCommand
	lastRestore    anime.RestoreAnimeCommand
	lastRepeat     anime.RepeatAnimeCommand
	err            error
}

func (s *stubAppChapterService) ListChapterDayCounts(context.Context) ([]anime.ChapterDayCount, error) {
	return s.dayCounts, s.err
}

func (s *stubAppChapterService) ListChapterSchedule(_ context.Context, query anime.ChapterScheduleQuery) ([]anime.ChapterScheduleItem, error) {
	s.lastDay = query.Day
	return s.schedule, s.err
}

func (s *stubAppChapterService) AdjustWatchedChapters(_ context.Context, cmd anime.AdjustWatchedChaptersCommand) (anime.ChapterCommandResult, error) {
	s.lastAdjust = cmd
	return anime.ChapterCommandResult{
		AnimeID:     cmd.AnimeID,
		NroCapVisto: cmd.Delta,
		Estado:      0,
	}, s.err
}

func (s *stubAppChapterService) SetAnimeState(_ context.Context, cmd anime.SetAnimeStateCommand) (anime.ChapterCommandResult, error) {
	s.lastState = cmd
	return anime.ChapterCommandResult{
		AnimeID: cmd.AnimeID,
		Estado:  cmd.Estado,
	}, s.err
}

func (s *stubAppChapterService) SoftDeleteAnime(_ context.Context, cmd anime.SoftDeleteAnimeCommand) (anime.ChapterCommandResult, error) {
	s.lastSoftDelete = cmd
	return anime.ChapterCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppChapterService) RestoreAnime(_ context.Context, cmd anime.RestoreAnimeCommand) (anime.ChapterCommandResult, error) {
	s.lastRestore = cmd
	return anime.ChapterCommandResult{AnimeID: cmd.AnimeID}, s.err
}

func (s *stubAppChapterService) RepeatAnime(_ context.Context, cmd anime.RepeatAnimeCommand) (anime.ChapterCommandResult, error) {
	s.lastRepeat = cmd
	return anime.ChapterCommandResult{AnimeID: cmd.AnimeID}, s.err
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

func (s *stubAppHTTPServer) Start() error                   { s.started = true; return nil }
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

type stubAppStore struct{}

func (stubAppStore) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return nil, nil
}

func (stubAppStore) ReplaceBaseline(context.Context, map[string]anime.SnapshotRecord, []string) error {
	return nil
}

func seedRuntimeAnimeSnapshot(t *testing.T, store anime.SnapshotStore, animeID string, payload string, modifiedAt int64) {
	t.Helper()
	hashBytes := md5.Sum([]byte(payload))
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          hex.EncodeToString(hashBytes[:]),
			ModifiedAt:    modifiedAt,
		},
	}, nil); err != nil {
		t.Fatalf("seed runtime anime snapshot: %v", err)
	}
}

type fakeAppDownloadStore struct {
	jdConfig       download.JDConfig
	scheduleConfig download.ScheduleConfig
	hosterPriority []download.HosterPriorityEntry
	runs           []download.DownloadRun

	setHosterPriorityEntries []download.HosterPriorityEntry
	setJDConfigCfg           download.JDConfig
	setJDConfigPassword      *string
	setScheduleConfigCfg     download.ScheduleConfig
}

func (f *fakeAppDownloadStore) ListHosterPriority(context.Context, string) ([]download.HosterPriorityEntry, error) {
	return f.hosterPriority, nil
}

func (f *fakeAppDownloadStore) SetHosterPriority(_ context.Context, _ string, entries []download.HosterPriorityEntry) error {
	f.setHosterPriorityEntries = entries
	return nil
}

func (f *fakeAppDownloadStore) SeedHosterPriorityIfEmpty(context.Context, string, []download.HosterPriorityEntry) error {
	return nil
}

func (f *fakeAppDownloadStore) GetJDConfig(context.Context) (download.JDConfig, error) {
	return f.jdConfig, nil
}

func (f *fakeAppDownloadStore) SetJDConfig(_ context.Context, cfg download.JDConfig, password *string) error {
	f.setJDConfigCfg = cfg
	f.setJDConfigPassword = password
	return nil
}

func (f *fakeAppDownloadStore) SetJDStatus(context.Context, string, int64) error { return nil }

func (f *fakeAppDownloadStore) DecryptedPassword(context.Context) (string, bool, error) {
	return "", false, nil
}

func (f *fakeAppDownloadStore) GetScheduleConfig(context.Context) (download.ScheduleConfig, error) {
	return f.scheduleConfig, nil
}

func (f *fakeAppDownloadStore) SetScheduleConfig(_ context.Context, cfg download.ScheduleConfig) error {
	f.setScheduleConfigCfg = cfg
	return nil
}

func (f *fakeAppDownloadStore) MarkScheduleRun(context.Context, int64, string, int64) error {
	return nil
}

func (f *fakeAppDownloadStore) OpenRun(context.Context, download.DownloadRun) error { return nil }

func (f *fakeAppDownloadStore) UpdateRunProgress(context.Context, download.DownloadRun) error {
	return nil
}

func (f *fakeAppDownloadStore) FinalizeRun(context.Context, download.DownloadRun) error { return nil }

func (f *fakeAppDownloadStore) ListRuns(context.Context, int) ([]download.DownloadRun, error) {
	return f.runs, nil
}

func (f *fakeAppDownloadStore) ReconcileInterruptedRuns(context.Context, int64) (int, error) {
	return 0, nil
}

var _ download.DownloadStore = (*fakeAppDownloadStore)(nil)

type fakeAppScheduler struct {
	triggerNowCalls          int
	notifyConfigChangedCalls int
	triggerNowErr            error
	status                   schedule.Status
}

func (f *fakeAppScheduler) Start(context.Context) {}

func (f *fakeAppScheduler) Stop() {}

func (f *fakeAppScheduler) NotifyConfigChanged() { f.notifyConfigChangedCalls++ }

func (f *fakeAppScheduler) TriggerNow(context.Context, string) error {
	f.triggerNowCalls++
	return f.triggerNowErr
}

func (f *fakeAppScheduler) Status(context.Context) schedule.Status {
	return f.status
}

var _ schedule.Scheduler = (*fakeAppScheduler)(nil)

type stubPendingLookup struct {
	pending []bridgeSync.ChangelogEntry
}

func (s stubPendingLookup) ListSinceTimestamp(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListAfterID(context.Context, int64) ([]bridgeSync.ChangelogEntry, error) {
	return nil, nil
}

func (s stubPendingLookup) ListPending(context.Context) ([]bridgeSync.ChangelogEntry, error) {
	return append([]bridgeSync.ChangelogEntry(nil), s.pending...), nil
}

func (s stubPendingLookup) LastID(context.Context) (int64, error) {
	return 0, nil
}

func (s stubPendingLookup) LastChangedAt(context.Context) (*int64, error) {
	return nil, nil
}

func (s stubPendingLookup) AcknowledgeDevice(context.Context, string, int64, int64) error {
	return nil
}

func (s stubPendingLookup) PruneAcknowledgedChangelog(context.Context) (int64, error) {
	return 0, nil
}

type spyDeviceStore struct {
	stubAppDeviceStore
	savedToken  string
	saveErr     error
	activeToken string
	pruneCalls  int
}

func (s *spyDeviceStore) SavePairingToken(_ context.Context, token string, _ int64) error {
	s.savedToken = token
	return s.saveErr
}

func (s *spyDeviceStore) FindActivePairingToken(context.Context, int64) (string, error) {
	if s.activeToken == "" {
		return "", device.ErrInvalidPairingToken
	}
	return s.activeToken, nil
}

func (s *spyDeviceStore) PruneExpiredPairingTokens(context.Context, int64) (int64, error) {
	s.pruneCalls++
	return 0, nil
}

func isHex32(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}
