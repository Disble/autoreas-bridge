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

// --- fakes (all-fakes unit tests per design §12 "Service" testing strategy row) ---

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

var _ contracts.AnimeQueryService = (*svcFakeAnimeQuery)(nil)

// svcFakeEpisodeSource is a controllable sites.EpisodeSource fake.
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

// svcFakeJDClient is a controllable jdownloader.JDClient fake.
type svcFakeJDClient struct {
	mu sync.Mutex

	ensureOnlineErr error
	addAndStartErr  map[string]error // keyed by hoster name
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

// svcFakeCounter is a controllable filesystem.EpisodeCounter fake keyed by folder.
type svcFakeCounter struct {
	mu                    sync.Mutex
	atRoot                map[string]int
	recursive             map[string]int
	recursiveAfterFlatten map[string]int // value CountRecursive returns once Flatten has been called for that folder
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

// svcFakeFlattener is a controllable filesystem.Flattener fake.
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

// svcFakeNotifier is a controllable notification.Notifier fake recording every Notify call.
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

// svcFakeDownloadStore is an in-memory DownloadStore fake.
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

// svcFakeHosterResolver returns a fixed order regardless of site.
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

// --- test helpers ---

func ptrStr(s string) *string { return &s }
func ptrInt(i int) *int       { return &i }

// todayDiaName returns the MobileAnimeDay.Dia name (Spanish) for "now" so fixtures can build
// an anime that is "active today" deterministically regardless of which day the suite runs.
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
	fixedNow := time.Date(2026, 6, 22, 10, 0, 0, 0, time.UTC) // Monday
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

// --- 6.1/6.2: per-anime fan-out failure isolation -> partial ---

func TestRunOnceIsolatesPerAnimeFailureAndMarksRunPartial(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/ok-anime/": {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/ok-anime/5/"},
		},
		listErr: map[string]error{
			"https://jkanime.net/broken-anime/": errors.New("boom: site scrape failed"),
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/ok-anime/5/": {{URL: "http://mediafire.example/5", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	okFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-ok",
			Nombre:  "OK Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/ok-anime/"),
			Carpeta: ptrStr(okFolder),
		},
		{
			ID:      "anime-broken",
			Nombre:  "Broken Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/broken-anime/"),
			Carpeta: ptrStr(t.TempDir()),
		},
	}}

	deps.Counter = &svcFakeCounter{
		atRoot:    map[string]int{okFolder: 0},
		recursive: map[string]int{okFolder: 1}, // simulate the enqueue having already landed a file
	}

	svc := NewService(deps)

	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected RunOnce to return nil error even on per-anime failure, got %v", err)
	}

	if result.Status != "partial" {
		t.Fatalf("expected run status %q, got %q", "partial", result.Status)
	}

	store := deps.Store.(*svcFakeDownloadStore)
	run, ok := store.getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q to be persisted", result.RunID)
	}
	if run.Status != "partial" {
		t.Fatalf("expected persisted run status %q, got %q", "partial", run.Status)
	}
	if run.FinishedAtMs == nil {
		t.Fatal("expected FinalizeRun to set FinishedAtMs (terminal row)")
	}
}

// --- 6.3/6.4: JD-offline degradation persists manual links + notifies ---

func TestRunOnceDegradesToJDOfflineAndPersistsManualLinks(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/anime/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-1",
			Nombre:  "Some Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/anime/"),
			Carpeta: ptrStr(t.TempDir()),
		},
	}}

	jd := &svcFakeJDClient{ensureOnlineErr: ErrJDOffline}
	deps.JD = jd

	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected RunOnce to degrade gracefully on jd offline, got err %v", err)
	}

	if result.Status != "jd_offline" {
		t.Fatalf("expected run status %q, got %q", "jd_offline", result.Status)
	}

	store := deps.Store.(*svcFakeDownloadStore)
	run, ok := store.getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if len(run.ManualLinks) == 0 {
		t.Fatal("expected manual links to be persisted on the run when JD is offline")
	}
	if run.ManualLinks[0].Anime != "Some Anime" {
		t.Fatalf("expected manual link anime name %q, got %q", "Some Anime", run.ManualLinks[0].Anime)
	}
	if run.ManualLinks[0].Episode != 3 {
		t.Fatalf("expected manual link episode 3, got %d", run.ManualLinks[0].Episode)
	}

	found := false
	for _, n := range notifier.notifications() {
		if n.Level == notification.LevelWarning || n.Level == notification.LevelError {
			found = true
		}
	}
	if !found {
		t.Fatal("expected Notifier.Notify to be called on jd_offline degradation")
	}
}

// --- no animes today ---

func TestRunOnceReturnsNoAnimesTodayWhenNoneActiveToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	// pick a weekday that is NOT today so the fixture anime is filtered out entirely.
	otherDay := now.AddDate(0, 0, 1)
	otherDia := todayDiaName(otherDay)

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-1",
			Nombre:  "Not Today Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: otherDia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/anime/"),
			Carpeta: ptrStr(t.TempDir()),
		},
	}}

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "no_animes_today" {
		t.Fatalf("expected run status %q, got %q", "no_animes_today", result.Status)
	}
}

func TestRunOnceNotifiesWhenRunStarts(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	deps.Animes = &svcFakeAnimeQuery{}

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}

	notifications := notifier.notifications()
	if len(notifications) == 0 {
		t.Fatal("expected a run-start notification")
	}
	got := notifications[0]
	if got.Title != "Download run started" {
		t.Fatalf("expected start notification title, got %q", got.Title)
	}
	if got.Level != notification.LevelInfo {
		t.Fatalf("expected info notification level, got %q", got.Level)
	}
	if got.Source != "download" || got.CorrelationID != "run-fixed" {
		t.Fatalf("unexpected start notification metadata: %#v", got)
	}
}

func TestRunOnceMarksScheduledLastRunBeforeFinishedEvent(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	store := deps.Store.(*svcFakeDownloadStore)
	store.scheduleCfg.NextRunAtMs = 1_800_000_000_000
	deps.Animes = &svcFakeAnimeQuery{}

	finishedSeen := make(chan ScheduleConfig, 1)
	deps.Bus.Subscribe(events.EventNameDownloadRunFinished, func(events.Event) {
		cfg, _ := store.GetScheduleConfig(context.Background())
		finishedSeen <- cfg
	})

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected run status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}

	select {
	case cfg := <-finishedSeen:
		if cfg.LastRunAtMs != deps.Clock().UnixMilli() || cfg.LastRunStatus != RunStatusNoAnimesToday {
			t.Fatalf("schedule config at finished event = %#v, want last run marked with status %q", cfg, RunStatusNoAnimesToday)
		}
		if cfg.NextRunAtMs != 1_800_000_000_000 {
			t.Fatalf("next run changed to %d, want preserved value", cfg.NextRunAtMs)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for download.run_finished event")
	}
}

func TestRunOnceReturnsNoAnimesTodayWhenOnlyInactiveAnimeMatchesToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-inactive",
			Nombre:  "Inactive Today Anime",
			Activo:  0,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/inactive-anime/"),
			Carpeta: ptrStr(t.TempDir()),
		},
	}}

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "no_animes_today" {
		t.Fatalf("expected run status %q, got %q", "no_animes_today", result.Status)
	}
}

// --- hoster fallback on first-hoster enqueue failure ---

func TestRunOnceFallsBackToNextHosterWhenFirstHosterEnqueueFails(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {
				{URL: "http://mediafire.example/1", Hoster: "Mediafire"},
				{URL: "http://mega.example/1", Hoster: "Mega"},
			},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-1",
			Nombre:  "Some Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/anime/"),
			Carpeta: ptrStr(destFolder),
		},
	}}

	deps.Hosters = &svcFakeHosterResolver{order: []HosterPriorityEntry{
		{Hoster: "Mediafire", Priority: 0, Enabled: true},
		{Hoster: "Mega", Priority: 1, Enabled: true},
	}}

	jd := &svcFakeJDClient{
		addAndStartErr: map[string]error{"Mediafire": errors.New("hoster down")},
	}
	deps.JD = &fallbackAwareJDClient{svcFakeJDClient: jd, failHoster: "Mediafire"}

	counter := &svcFakeCounter{
		atRoot:    map[string]int{destFolder: 0},
		recursive: map[string]int{destFolder: 1}, // simulate the Mega enqueue landing a file
	}
	deps.Counter = counter

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	jdClient := deps.JD.(*fallbackAwareJDClient)
	if len(jdClient.attemptedHosters) < 2 {
		t.Fatalf("expected at least 2 hoster attempts (fallback), got %d: %v", len(jdClient.attemptedHosters), jdClient.attemptedHosters)
	}
	if jdClient.attemptedHosters[0] != "Mediafire" {
		t.Fatalf("expected first attempt to be Mediafire, got %s", jdClient.attemptedHosters[0])
	}
	if jdClient.attemptedHosters[1] != "Mega" {
		t.Fatalf("expected fallback attempt to be Mega, got %s", jdClient.attemptedHosters[1])
	}
	_ = result
}

// fallbackAwareJDClient wraps svcFakeJDClient and infers which hoster a given AddAndStart call
// is for by inspecting the URL host substring (the fixtures use "mediafire.example" /
// "mega.example" URLs precisely so this inference is unambiguous), recording attempted hoster
// names in call order for the fallback assertion. This avoids requiring the orchestrator under
// test to call any test-only hook -- it only ever calls the real JDClient.AddAndStart signature.
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

// --- skip accounting: Tipo 1/2 and gap (missing pagina/carpeta) excluded from animes_checked ---

func TestRunOnceAccountsSkipsSeparatelyFromAnimesChecked(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/serie/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/serie/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/serie/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-movie",
			Nombre:  "A Movie",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Tipo:    ptrInt(1), // Pelicula -> unsupported, skipped
			Pagina:  ptrStr("https://jkanime.net/movie/"),
			Carpeta: ptrStr(t.TempDir()),
		},
		{
			ID:     "anime-no-folder",
			Nombre: "No Folder Anime",
			Activo: 1,
			Dias:   []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina: ptrStr("https://jkanime.net/no-folder/"),
			// Carpeta intentionally nil -> missing_carpeta skip
		},
		{
			ID:      "anime-serie",
			Nombre:  "A Serie",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/serie/"),
			Carpeta: ptrStr(destFolder),
		},
	}}

	counter := &svcFakeCounter{
		atRoot:    map[string]int{destFolder: 0},
		recursive: map[string]int{destFolder: 1},
	}
	deps.Counter = counter

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	store := deps.Store.(*svcFakeDownloadStore)
	run, ok := store.getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}

	if run.SkippedCount != 2 {
		t.Fatalf("expected SkippedCount=2 (movie + missing carpeta), got %d", run.SkippedCount)
	}
	if run.AnimesChecked != 1 {
		t.Fatalf("expected AnimesChecked=1 (only the serie was evaluated), got %d", run.AnimesChecked)
	}
}

// --- 6.7/6.8: structural assertion -- ServiceDeps has no AnimeWriteService dependency ---

func TestServiceDepsHasNoAnimeWriteServiceDependency(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)

	// Structural assertion: ServiceDeps.Animes is typed as contracts.AnimeQueryService, which
	// does NOT embed or satisfy contracts.AnimeWriteService. If ServiceDeps ever gained a write
	// dependency, this test documents the violated invariant (download-orchestration spec "No
	// Write-Back to the Anime Context").
	var _ contracts.AnimeQueryService = deps.Animes
	if _, isWriter := deps.Animes.(contracts.AnimeWriteService); isWriter {
		t.Fatal("ServiceDeps.Animes must not also satisfy AnimeWriteService -- download is read-only")
	}
}

// --- happy path: episode found, downloaded, run status ok ---

func TestRunOnceHappyPathDownloadsAndMarksRunOk(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-1",
			Nombre:  "Some Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/anime/"),
			Carpeta: ptrStr(destFolder),
		},
	}}

	counter := &svcFakeCounter{
		atRoot:    map[string]int{destFolder: 0},
		recursive: map[string]int{destFolder: 1},
	}
	deps.Counter = counter

	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected run status %q, got %q", "ok", result.Status)
	}

	store := deps.Store.(*svcFakeDownloadStore)
	run, ok := store.getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.EpisodesDownloaded < 1 {
		t.Fatalf("expected at least 1 episode downloaded, got %d", run.EpisodesDownloaded)
	}

	if len(notifier.notifications()) == 0 {
		t.Fatal("expected a user-notable success notification to be sent")
	}
}

func TestRunOncePersistsProgressBeforeFinalStatus(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-1",
		Nombre:  "Some Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/anime/"),
		Carpeta: ptrStr(destFolder),
	}}}
	deps.Counter = &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}}

	bus := events.NewBus()
	progressEvents := 0
	bus.Subscribe(events.EventNameDownloadRunProgress, func(event events.Event) {
		progressEvents++
	})
	deps.Bus = bus

	svc := NewService(deps)
	if _, err := svc.RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	snapshots := deps.Store.(*svcFakeDownloadStore).progressSnapshots()
	if len(snapshots) == 0 {
		t.Fatal("expected at least one persisted progress snapshot before finalization")
	}
	last := snapshots[len(snapshots)-1]
	if last.AnimesChecked != 1 || last.EpisodesFound != 1 || last.EpisodesDownloaded != 1 {
		t.Fatalf("expected downloaded episode progress before final status, got %#v", last)
	}
	if progressEvents == 0 {
		t.Fatal("expected download.run_progress to be published for UI refresh")
	}
}

// --- notifier failure must not fail the run (fan-out isolation at the Service level) ---

func TestRunOnceSurvivesNotifierFailure(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:      "anime-1",
			Nombre:  "Some Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/anime/"),
			Carpeta: ptrStr(destFolder),
		},
	}}

	counter := &svcFakeCounter{
		atRoot:    map[string]int{destFolder: 0},
		recursive: map[string]int{destFolder: 1},
	}
	deps.Counter = counter
	deps.Notifier = &svcFakeNotifier{err: errors.New("notifier transport down")}

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected RunOnce to succeed even when Notifier fails, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected run status %q despite notifier failure, got %q", "ok", result.Status)
	}
}
