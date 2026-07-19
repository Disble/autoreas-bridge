package download

import (
	"context"
	"strconv"
	"strings"
	"sync"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
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

func (f *svcFakeAnimeQuery) ListAnimeHistory(ctx context.Context) ([]contracts.AnimeHistoryItem, error) {
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

func (f *svcFakeEpisodeSource) EpisodePageURL(ctx context.Context, pageURL string, episode int) (string, error) {
	return strings.TrimRight(pageURL, "/") + "/" + strconv.Itoa(episode) + "/", nil
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

	ensureOnlineErr   error
	ensureOnlineCalls int
	addAndStartCall   []jdownloader.EnqueueRequest
}

func (f *svcFakeJDClient) Connect(ctx context.Context) error { return nil }
func (f *svcFakeJDClient) ListDevices(ctx context.Context) ([]jdownloader.DeviceStatus, error) {
	return nil, nil
}
func (f *svcFakeJDClient) EnsureOnline(ctx context.Context, deviceName string, launchIfMissing bool) error {
	f.mu.Lock()
	f.ensureOnlineCalls++
	f.mu.Unlock()
	return f.ensureOnlineErr
}

// ensureOnlineCallCount returns how many times EnsureOnline was invoked, so tests can assert
// JDownloader is never launched (or launched exactly once) for a given run.
func (f *svcFakeJDClient) ensureOnlineCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.ensureOnlineCalls
}
func (f *svcFakeJDClient) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.addAndStartCall = append(f.addAndStartCall, req)
	return nil
}

// PackageStatusByDestination defaults to a "downloading" verdict (Matched=false, no counts, no
// links) so tests that never configure JD status keep the pre-existing "wait for disk" behavior.
func (f *svcFakeJDClient) PackageStatusByDestination(ctx context.Context, deviceName, destination string) (jdownloader.DestinationStatus, error) {
	return jdownloader.DestinationStatus{}, nil
}

func (f *svcFakeJDClient) RemoveByDestination(ctx context.Context, deviceName, destination string) error {
	return nil
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
	if f.flattenedFolders != nil && f.flattenedFolders[folder] {
		if v, ok := f.recursive[folder]; ok {
			if root := f.atRoot[folder]; root > v {
				return root
			}
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

func (f *svcFakeCounter) HighestEpisodeAtRoot(folder string) int {
	return f.CountAtRoot(folder)
}

func (f *svcFakeCounter) HighestEpisodeRecursive(folder string) int {
	return f.CountRecursive(folder)
}

func (f *svcFakeCounter) Flatten(folder string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.flattenedFolders == nil {
		f.flattenedFolders = map[string]bool{}
	}
	f.flattenedFolders[folder] = true
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

// notifications returns a copy of notifications sent to the fake notifier.
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
	runs        map[string]Run
	progress    []Run
	openRunErr  error
}

// newsvcFakeDownloadStore creates an empty in-memory download store fake.
func newsvcFakeDownloadStore() *svcFakeDownloadStore {
	return &svcFakeDownloadStore{
		hosters: map[string][]HosterPriorityEntry{},
		runs:    map[string]Run{},
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

func (s *svcFakeDownloadStore) OpenRun(ctx context.Context, run Run) error {
	if s.openRunErr != nil {
		return s.openRunErr
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	return nil
}

func (s *svcFakeDownloadStore) FinalizeRun(ctx context.Context, run Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	return nil
}

func (s *svcFakeDownloadStore) UpdateRunProgress(ctx context.Context, run Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[run.RunID] = run
	s.progress = append(s.progress, run)
	return nil
}

func (s *svcFakeDownloadStore) ListRuns(ctx context.Context, limit int) ([]Run, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Run, 0, len(s.runs))
	for _, r := range s.runs {
		out = append(out, r)
	}
	return out, nil
}

func (s *svcFakeDownloadStore) ReconcileInterruptedRuns(ctx context.Context, atMs int64) (int, error) {
	return 0, nil
}

// getRun returns a stored run by ID.
func (s *svcFakeDownloadStore) getRun(runID string) (Run, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.runs[runID]
	return r, ok
}

// progressSnapshots returns a copy of recorded progress snapshots.
func (s *svcFakeDownloadStore) progressSnapshots() []Run {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Run, len(s.progress))
	copy(out, s.progress)
	return out
}

var _ Store = (*svcFakeDownloadStore)(nil)

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
