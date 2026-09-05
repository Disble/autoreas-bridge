package download

import (
	"context"
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
)

type spySiteRegistry struct {
	mu           sync.Mutex
	resolveCalls int
	source       sites.EpisodeSource
	err          error
}

func (r *spySiteRegistry) Resolve(pageURL string) (sites.EpisodeSource, error) {
	r.mu.Lock()
	r.resolveCalls++
	r.mu.Unlock()
	if r.err != nil {
		return nil, r.err
	}
	return r.source, nil
}

func (r *spySiteRegistry) Register(source sites.EpisodeSource) {
	r.source = source
}

// calls returns the number of site-resolution attempts.
func (r *spySiteRegistry) calls() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.resolveCalls
}

type spyEpisodeSource struct {
	mu                sync.Mutex
	listing           sites.EpisodeListing
	extractLinks      []sites.DownloadLink
	listEpisodesCalls int
	extractCalls      int
}

func (s *spyEpisodeSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "jkanime", Priority: 0}
}

func (s *spyEpisodeSource) Matches(pageURL string) bool {
	return true
}

func (s *spyEpisodeSource) ListEpisodes(ctx context.Context, pageURL string) (sites.EpisodeListing, error) {
	s.mu.Lock()
	s.listEpisodesCalls++
	s.mu.Unlock()
	return s.listing, nil
}

func (s *spyEpisodeSource) EpisodePageURL(ctx context.Context, pageURL string, episode int) (string, error) {
	return strings.TrimRight(pageURL, "/") + "/" + strconv.Itoa(episode) + "/", nil
}

func (s *spyEpisodeSource) ExtractLinks(ctx context.Context, episodePageURL string) ([]sites.DownloadLink, error) {
	s.mu.Lock()
	s.extractCalls++
	s.mu.Unlock()
	return s.extractLinks, nil
}

// counts returns listing and link-extraction call counts.
func (s *spyEpisodeSource) counts() (int, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listEpisodesCalls, s.extractCalls
}

func TestRunOnceFallsBackToNextHosterWhenFirstHosterEnqueueFails(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
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
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "Some Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: new("https://jkanime.net/anime/"),
		Folder:    new(destFolder),
	}}}
	deps.Hosters = &svcFakeHosterResolver{order: []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}, {Hoster: "Mega", Priority: 1, Enabled: true}}}
	jd := &svcFakeJDClient{}
	deps.JD = &fallbackAwareJDClient{svcFakeJDClient: jd, failHoster: "Mediafire"}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	_ = result

	jdClient := deps.JD.(*fallbackAwareJDClient)
	if len(jdClient.attemptedHosters) < 2 {
		t.Fatalf("expected at least 2 hoster attempts (fallback), got %d: %v", len(jdClient.attemptedHosters), jdClient.attemptedHosters)
	}
	if jdClient.attemptedHosters[0] != "Mediafire" || jdClient.attemptedHosters[1] != "Mega" {
		t.Fatalf("unexpected hoster attempt order: %v", jdClient.attemptedHosters)
	}
}

func TestRunOnceAccountsSkipsSeparatelyFromAnimesChecked(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
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
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-blocked",
		Name:      "Blocked Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: nil,
		Folder:    new(t.TempDir()),
	}, {
		ID:        "anime-no-folder",
		Name:      "No Folder Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: new("https://jkanime.net/no-folder/"),
	}, {
		ID:        "anime-serie",
		Name:      "A Serie",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: new("https://jkanime.net/serie/"),
		Folder:    new(destFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.SkippedCount != 2 || run.AnimesChecked != 1 {
		t.Fatalf("expected SkippedCount=2 and AnimesChecked=1, got %#v", run)
	}
}

func TestServiceDepsHasNoAnimeWriteServiceDependency(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	_ = contracts.AnimeQueryService(deps.Animes)
	if _, isWriter := deps.Animes.(contracts.AnimePatcher); isWriter {
		t.Fatal("ServiceDeps.Animes must not also satisfy AnimePatcher -- download is read-only")
	}
}

func TestProcessAnimeRevalidatesCurrentSourceBeforeRuntimeWork(t *testing.T) {
	deps := baseDeps(t)
	source := &spyEpisodeSource{}
	registry := &spySiteRegistry{source: source, err: ErrSiteUnsupported}
	deps.Sites = registry
	folder := t.TempDir()
	anime := contracts.MobileAnime{ID: "stale", Name: "Stale", SourceURL: new("https://unsupported.example/stale"), Folder: &folder}

	got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(true))
	if !got.skipped {
		t.Fatalf("expected stale unsupported source to be skipped, got %#v", got)
	}
	if source.listEpisodesCalls != 0 {
		t.Fatalf("stale source triggered ListEpisodes %d times", source.listEpisodesCalls)
	}
}

func TestProcessAnimeUsesDerivedDestinationWithoutPersistingIt(t *testing.T) {
	root := filepath.Join("D:", "Downloads")
	destination := filepath.Join(root, "Ready Anime")
	source := &spyEpisodeSource{listing: sites.EpisodeListing{LatestEpisode: 0}}
	flattener := &svcFakeFlattener{}
	deps := baseDeps(t)
	deps.Sites = &spySiteRegistry{source: source}
	deps.DownloadsRoot = func(context.Context) (string, error) { return root, nil }
	deps.Counter = &svcFakeCounter{atRoot: map[string]int{destination: 0}, recursive: map[string]int{destination: 0}}
	deps.Flattener = flattener
	anime := contracts.MobileAnime{ID: "derived", Name: "Ready: Anime", SourceURL: new("https://supported.example/ready")}

	got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(true))
	if !got.upToDate || got.skipped {
		t.Fatalf("expected derived destination to remain executable, got %#v", got)
	}
	if len(flattener.calls) != 1 || flattener.calls[0] != destination {
		t.Fatalf("flatten destinations = %#v, want [%q]", flattener.calls, destination)
	}
	if anime.Folder != nil {
		t.Fatalf("derived destination mutated caller anime folder: %v", *anime.Folder)
	}
}

func TestProcessAnimeFailsWhenDerivedDestinationSettingsCannotBeRead(t *testing.T) {
	deps := baseDeps(t)
	registry := &spySiteRegistry{source: &spyEpisodeSource{}}
	deps.Sites = registry
	deps.DownloadsRoot = func(context.Context) (string, error) {
		return "", errors.New("settings unavailable")
	}
	anime := contracts.MobileAnime{
		ID:        "settings-failure",
		Name:      "Settings Failure",
		SourceURL: new("https://supported.example/settings-failure"),
	}

	got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(true))

	if !got.failed || got.skipped || got.failureKind != FailureKindConfiguration {
		t.Fatalf("expected configuration failure without skip, got %#v", got)
	}
	if registry.calls() != 0 {
		t.Fatalf("expected settings failure before source resolution, got %d Resolve calls", registry.calls())
	}
}

func TestProcessAnimeReportsUpToDateWhenTotalCapMatchesOnDiskCount(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	deps := baseDeps(t)
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 12}, recursive: map[string]int{folder: 12}})
	source := &spyEpisodeSource{
		listing:      sites.EpisodeListing{LatestEpisode: 13, EpisodePageURL: "https://jkanime.net/anime/13/"},
		extractLinks: []sites.DownloadLink{{URL: "http://mediafire.example/13", Hoster: "Mediafire"}},
	}
	registry := &spySiteRegistry{source: source}
	deps.Sites = registry

	var availableEvents int
	deps.Bus.Subscribe(events.EventNameDownloadEpisodeAvailable, func(e events.Event) {
		availableEvents++
	})

	anime := contracts.MobileAnime{
		ID:            "anime-1",
		Name:          "Some Anime",
		Active:        1,
		SourceURL:     new("https://jkanime.net/anime/"),
		Folder:        new(folder),
		TotalEpisodes: new(12),
	}

	got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(false))

	// A season already complete on disk is "up to date" -- it was evaluated (against
	// TotalCap/on-disk), not skipped like a misconfigured anime.
	if !got.upToDate || got.skipped || got.failed || got.episodesFound != 0 || got.episodesDownloaded != 0 || got.episodesFailed != 0 || len(got.manualLinks) != 0 {
		t.Fatalf("expected up-to-date outcome for fully downloaded season, got %#v", got)
	}
	if registry.calls() != 1 {
		t.Fatalf("expected readiness revalidation before filesystem work, got %d Resolve calls", registry.calls())
	}
	if listCalls, extractCalls := source.counts(); listCalls != 0 || extractCalls != 0 {
		t.Fatalf("expected no online source calls, got ListEpisodes=%d ExtractLinks=%d", listCalls, extractCalls)
	}
	if availableEvents != 0 {
		t.Fatalf("expected no episode-available events, got %d", availableEvents)
	}
}

func TestProcessAnimeReportsUpToDateWhenNoNewEpisodeOnline(t *testing.T) {
	t.Parallel()

	folder := t.TempDir()
	deps := baseDeps(t)
	// On disk already has the latest online episode: NeedsDownload is false.
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 5}, recursive: map[string]int{folder: 5}})
	source := &spyEpisodeSource{
		listing: sites.EpisodeListing{LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/anime/5/"},
	}
	registry := &spySiteRegistry{source: source}
	deps.Sites = registry

	anime := contracts.MobileAnime{
		ID:        "anime-1",
		Name:      "Some Anime",
		Active:    1,
		SourceURL: new("https://jkanime.net/anime/"),
		Folder:    new(folder),
	}

	got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(true))

	if !got.upToDate || got.skipped || got.failed || got.episodesFound != 0 || got.episodesDownloaded != 0 {
		t.Fatalf("expected up-to-date outcome when nothing new is online, got %#v", got)
	}
}

func TestRunOnceCountsUpToDateWithinAnimesChecked(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/fresh/":   {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/fresh/1/"},
			"https://jkanime.net/current/": {LatestEpisode: 4, EpisodePageURL: "https://jkanime.net/current/4/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/fresh/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	freshFolder := t.TempDir()
	currentFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-fresh",
		Name:      "Fresh Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: new("https://jkanime.net/fresh/"),
		Folder:    new(freshFolder),
	}, {
		ID:        "anime-current",
		Name:      "Up To Date Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: new("https://jkanime.net/current/"),
		Folder:    new(currentFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{freshFolder: 0, currentFolder: 4},
		recursive: map[string]int{freshFolder: 1, currentFolder: 4},
	})

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	// animes_checked stays the count of everything evaluated (2); up_to_date_count is the
	// subset that had nothing new to download (1); neither is a skip.
	if run.AnimesChecked != 2 || run.UpToDateCount != 1 || run.SkippedCount != 0 {
		t.Fatalf("expected AnimesChecked=2, UpToDateCount=1, SkippedCount=0, got %#v", run)
	}
	if run.EpisodesDownloaded != 1 {
		t.Fatalf("expected EpisodesDownloaded=1, got %#v", run)
	}
}

func TestProcessAnimeContinuesOnlineLookupWhenTotalCapDoesNotBlock(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name     string
		totalCap *int
	}{
		{name: "nil_totalcap", totalCap: nil},
		{name: "zero_totalcap", totalCap: new(0)},
		{name: "different_totalcap", totalCap: new(12)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			folder := t.TempDir()
			deps := baseDeps(t)
			setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 11}, recursive: map[string]int{folder: 11}})
			source := &spyEpisodeSource{
				listing:      sites.EpisodeListing{LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/anime/12/"},
				extractLinks: []sites.DownloadLink{{URL: "http://mediafire.example/12", Hoster: "Mediafire"}},
			}
			registry := &spySiteRegistry{source: source}
			deps.Sites = registry

			var availableEvents int
			deps.Bus.Subscribe(events.EventNameDownloadEpisodeAvailable, func(e events.Event) {
				availableEvents++
			})

			anime := contracts.MobileAnime{
				ID:            "anime-1",
				Name:          "Some Anime",
				Active:        1,
				SourceURL:     new("https://jkanime.net/anime/"),
				Folder:        new(folder),
				TotalEpisodes: tc.totalCap,
			}

			got := NewService(deps).processAnime(context.Background(), "run-fixed", anime, fixedJDGate(false))

			if registry.calls() != 1 {
				t.Fatalf("expected Resolve to be called once, got %d calls", registry.calls())
			}
			if listCalls, extractCalls := source.counts(); listCalls != 1 || extractCalls != 1 {
				t.Fatalf("expected online flow to continue, got ListEpisodes=%d ExtractLinks=%d", listCalls, extractCalls)
			}
			if availableEvents != 1 {
				t.Fatalf("expected one episode-available event, got %d", availableEvents)
			}
			if len(got.manualLinks) != 1 || got.manualLinks[0].Episode != 12 {
				t.Fatalf("expected manual-link outcome for episode 12, got %#v", got)
			}
		})
	}
}
