package download

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

type svcFakeAnimeQuery struct {
	animes []contracts.MobileAnime
	err    error
}

func (f *svcFakeAnimeQuery) GetEffectiveAnime(ctx context.Context, id string) (*contracts.EffectiveAnime, error) {
	return nil, nil
}

func (f *svcFakeAnimeQuery) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.animes, nil
}

func (f *svcFakeAnimeQuery) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	for _, a := range f.animes {
		if a.ID == id {
			return &a, nil
		}
	}
	return nil, contracts.ErrAnimeNotFound
}

func (f *svcFakeAnimeQuery) ListAnimeItems(ctx context.Context) ([]contracts.AnimeListItem, error) {
	return nil, nil
}

func (f *svcFakeAnimeQuery) GetAnimeDetail(ctx context.Context, id string) (*contracts.AnimeDetail, error) {
	return nil, nil
}

var _ contracts.AnimeQueryService = (*svcFakeAnimeQuery)(nil)

type svcFakeEpisodeSource struct {
	name         string
	matchesFn    func(string) bool
	listEpisodes map[string]sites.EpisodeListing
	listErr      map[string]error
	extractLinks map[string][]sites.DownloadLink
	extractErr   map[string]error
}

func (f *svcFakeEpisodeSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: f.name, Priority: 0}
}

func (f *svcFakeEpisodeSource) Matches(pageURL string) bool {
	if f.matchesFn != nil {
		return f.matchesFn(pageURL)
	}
	return true
}

func (f *svcFakeEpisodeSource) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	if err, ok := f.listErr[pageURL]; ok {
		return sites.EpisodeListing{}, err
	}
	return f.listEpisodes[pageURL], nil
}

func (f *svcFakeEpisodeSource) ExtractLinks(ctx context.Context, episodePageURL string) ([]sites.DownloadLink, error) {
	if err, ok := f.extractErr[episodePageURL]; ok {
		return nil, err
	}
	return f.extractLinks[episodePageURL], nil
}

var _ sites.EpisodeSource = (*svcFakeEpisodeSource)(nil)

type svcFakeJDClient struct {
	mu sync.Mutex

	ensureOnlineErr error
	addAndStartCall []jdownloader.EnqueueRequest
}

func (f *svcFakeJDClient) Connect(ctx context.Context) error { return nil }
func (f *svcFakeJDClient) ListDevices(ctx context.Context) ([]jdownloader.DeviceStatus, error) {
	return nil, nil
}
func (f *svcFakeJDClient) EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error {
	return f.ensureOnlineErr
}
func (f *svcFakeJDClient) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.addAndStartCall = append(f.addAndStartCall, req)
	return nil
}
func (f *svcFakeJDClient) PackagesFinished(ctx context.Context, deviceName string) (bool, error) {
	return true, nil
}
func (f *svcFakeJDClient) Disconnect(ctx context.Context) error { return nil }

var _ jdownloader.JDClient = (*svcFakeJDClient)(nil)

type svcFakeCounter struct {
	mu                    sync.Mutex
	atRoot                map[string]int
	recursive             map[string]int
	recursiveAfterFlatten map[string]int
	flattenedFolders      map[string]bool
}

func (f *svcFakeCounter) CountAtRoot(folder string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.flattenedFolders != nil && f.flattenedFolders[folder] && f.recursiveAfterFlatten != nil {
		if v, ok := f.recursiveAfterFlatten[folder]; ok {
			return v
		}
	}
	return f.atRoot[folder]
}

func (f *svcFakeCounter) CountRecursive(folder string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.recursive[folder]
}

var _ filesystem.EpisodeCounter = (*svcFakeCounter)(nil)

type svcFakeFlattener struct {
	mu        sync.Mutex
	calls     []string
	err       error
	onFlatten func(folder string)
}

func (f *svcFakeFlattener) Flatten(ctx context.Context, folder string) (int, error) {
	f.mu.Lock()
	f.calls = append(f.calls, folder)
	f.mu.Unlock()
	if f.onFlatten != nil {
		f.onFlatten(folder)
	}
	return 0, f.err
}

var _ filesystem.Flattener = (*svcFakeFlattener)(nil)

type svcFakeNotifier struct {
	mu    sync.Mutex
	calls []notification.Notification
	err   error
}

func (f *svcFakeNotifier) Notify(ctx context.Context, n notification.Notification) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, n)
	return f.err
}

func (f *svcFakeNotifier) notifications() []notification.Notification {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]notification.Notification, len(f.calls))
	copy(out, f.calls)
	return out
}

var _ notification.Notifier = (*svcFakeNotifier)(nil)

type svcFakeDownloadStore struct {
	mu          sync.Mutex
	hosters     map[string][]HosterPriorityEntry
	jdConfig    JDConfig
	scheduleCfg ScheduleConfig
	runs        map[string]DownloadRun
	progress    []DownloadRun
	openRunErr  error
}

func newsvcFakeDownloadStore() *svcFakeDownloadStore {
	return &svcFakeDownloadStore{
		hosters: map[string][]HosterPriorityEntry{},
		runs:    map[string]DownloadRun{},
	}
}

func (s *svcFakeDownloadStore) ListHosterPriority(ctx context.Context, site string) ([]HosterPriorityEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hosters[site], nil
}

func (s *svcFakeDownloadStore) SetHosterPriority(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.hosters[site] = entries
	return nil
}

func (s *svcFakeDownloadStore) SeedHosterPriorityIfEmpty(ctx context.Context, site string, entries []HosterPriorityEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.hosters[site]) == 0 {
		s.hosters[site] = entries
	}
	return nil
}

func (s *svcFakeDownloadStore) GetJDConfig(ctx context.Context) (JDConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.jdConfig, nil
}

func (s *svcFakeDownloadStore) SetJDConfig(ctx context.Context, cfg JDConfig, plaintextPassword *string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jdConfig = cfg
	if plaintextPassword != nil {
		s.jdConfig.HasPassword = *plaintextPassword != ""
	}
	return nil
}

func (s *svcFakeDownloadStore) SetJDStatus(ctx context.Context, status string, atMs int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jdConfig.LastSeenStatus = status
	s.jdConfig.LastSeenAtMs = atMs
	return nil
}

func (s *svcFakeDownloadStore) DecryptedPassword(ctx context.Context) (string, bool, error) {
	return "", false, nil
}

func (s *svcFakeDownloadStore) GetScheduleConfig(ctx context.Context) (ScheduleConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scheduleCfg, nil
}

func (s *svcFakeDownloadStore) SetScheduleConfig(ctx context.Context, cfg ScheduleConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scheduleCfg = cfg
	return nil
}

func (s *svcFakeDownloadStore) MarkScheduleRun(ctx context.Context, lastAtMs int64, status string, nextAtMs int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scheduleCfg.LastRunAtMs = lastAtMs
	s.scheduleCfg.LastRunStatus = status
	s.scheduleCfg.NextRunAtMs = nextAtMs
	return nil
}

func (s *svcFakeDownloadStore) OpenRun(ctx context.Context, run DownloadRun) error {
	if s.openRunErr != nil {
		return s.openRunErr
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	return nil
}

func (s *svcFakeDownloadStore) FinalizeRun(ctx context.Context, run DownloadRun) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	return nil
}

func (s *svcFakeDownloadStore) UpdateRunProgress(ctx context.Context, run DownloadRun) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	s.progress = append(s.progress, run)
	return nil
}

func (s *svcFakeDownloadStore) ListRuns(ctx context.Context, limit int) ([]DownloadRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]DownloadRun, 0, len(s.runs))
	for _, r := range s.runs {
		out = append(out, r)
	}
	return out, nil
}

func (s *svcFakeDownloadStore) ReconcileInterruptedRuns(ctx context.Context, atMs int64) (int, error) {
	return 0, nil
}

func (s *svcFakeDownloadStore) getRun(runID string) (DownloadRun, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.runs[runID]
	return r, ok
}

func (s *svcFakeDownloadStore) progressSnapshots() []DownloadRun {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]DownloadRun, len(s.progress))
	copy(out, s.progress)
	return out
}

var _ DownloadStore = (*svcFakeDownloadStore)(nil)

type svcFakeHosterResolver struct {
	order []HosterPriorityEntry
}

func (f *svcFakeHosterResolver) Order(site string) ([]HosterPriorityEntry, error) {
	return f.order, nil
}

func (f *svcFakeHosterResolver) OrderWithDiscovered(site string, discovered []string) ([]HosterPriorityEntry, error) {
	return f.order, nil
}

var _ HosterResolver = (*svcFakeHosterResolver)(nil)

func ptrStr(s string) *string { return &s }
func ptrInt(i int) *int       { return &i }

func todayDiaName(now time.Time) string {
	names := map[time.Weekday]string{
		time.Monday:    "Lunes",
		time.Tuesday:   "Martes",
		time.Wednesday: "Miércoles",
		time.Thursday:  "Jueves",
		time.Friday:    "Viernes",
		time.Saturday:  "Sábado",
		time.Sunday:    "Domingo",
	}
	return names[now.Weekday()]
}

func baseDeps(t *testing.T) ServiceDeps {
	t.Helper()
	fixedNow := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC)
	return ServiceDeps{
		Animes:    &svcFakeAnimeQuery{},
		Sites:     NewStaticRegistry(),
		Hosters:   &svcFakeHosterResolver{order: []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}}},
		JD:        &svcFakeJDClient{},
		Counter:   &svcFakeCounter{atRoot: map[string]int{}, recursive: map[string]int{}},
		Flattener: &svcFakeFlattener{},
		Store:     newsvcFakeDownloadStore(),
		Notifier:  &svcFakeNotifier{},
		Bus:       events.NewBus(),
		Logger:    sharedlogger.NewFanoutLogger(),
		Clock:     func() time.Time { return fixedNow },
		NewRunID:  func() string { return "run-fixed" },
		PollSleep: func(time.Duration) {},
	}
}

type fallbackAwareJDClient struct {
	*svcFakeJDClient
	failHoster       string
	mu               sync.Mutex
	attemptedHosters []string
}

func (f *fallbackAwareJDClient) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	hoster := inferHosterFromURLs(req.URLs)

	f.mu.Lock()
	f.attemptedHosters = append(f.attemptedHosters, hoster)
	f.mu.Unlock()

	if hoster == f.failHoster {
		return errors.New("hoster down")
	}
	return f.svcFakeJDClient.AddAndStart(ctx, deviceName, req)
}

func inferHosterFromURLs(urls []string) string {
	for _, u := range urls {
		switch {
		case strings.Contains(u, "mediafire"):
			return "Mediafire"
		case strings.Contains(u, "mega"):
			return "Mega"
		}
	}
	return ""
}
