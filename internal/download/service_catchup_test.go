package download

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/filesystem"
	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/download/sites"
)

func TestRunOnceCatchesUpSequentialMissingEpisodesForOneAnime(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/catchup/": {LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/catchup/12/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/catchup/10/": {{URL: "http://mediafire.example/10", Hoster: "Mediafire"}},
			"https://jkanime.net/catchup/11/": {{URL: "http://mediafire.example/11", Hoster: "Mediafire"}},
			"https://jkanime.net/catchup/12/": {{URL: "http://mediafire.example/12", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-1",
		Nombre:  "Catchup Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/catchup/"),
		Carpeta: ptrStr(folder),
	}}}
	counter := newCatchupCounter(map[string]int{folder: 9})
	deps.Counter = counter
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}
	jd := &recordingCatchupJD{counter: counter}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.EpisodesFound != 3 || run.EpisodesDownloaded != 3 || run.EpisodesFailed != 0 {
		t.Fatalf("expected 3 found/downloaded and 0 failed, got %#v", run)
	}
	if got := jd.episodes(); !equalInts(got, []int{10, 11, 12}) {
		t.Fatalf("expected sequential episode enqueue [10 11 12], got %v", got)
	}
	if got := counter.CountAtRoot(folder); got != 12 {
		t.Fatalf("expected final CountAtRoot=12, got %d", got)
	}
}

func TestRunOnceProcessesMultipleAnimesAndAccumulatesCatchupCounters(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	folderA := t.TempDir()
	folderB := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/a/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/a/3/"},
			"https://jkanime.net/b/": {LatestEpisode: 7, EpisodePageURL: "https://jkanime.net/b/7/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/a/2/": {{URL: "http://mediafire.example/a/2", Hoster: "Mediafire"}},
			"https://jkanime.net/a/3/": {{URL: "http://mediafire.example/a/3", Hoster: "Mediafire"}},
			"https://jkanime.net/b/6/": {{URL: "http://mediafire.example/b/6", Hoster: "Mediafire"}},
			"https://jkanime.net/b/7/": {{URL: "http://mediafire.example/b/7", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-a",
		Nombre:  "Anime A",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/a/"),
		Carpeta: ptrStr(folderA),
	}, {
		ID:      "anime-b",
		Nombre:  "Anime B",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/b/"),
		Carpeta: ptrStr(folderB),
	}}}
	counter := newCatchupCounter(map[string]int{folderA: 1, folderB: 5})
	deps.Counter = counter
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}
	jd := &recordingCatchupJD{counter: counter}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.AnimesChecked != 2 || run.EpisodesFound != 4 || run.EpisodesDownloaded != 4 || run.EpisodesFailed != 0 {
		t.Fatalf("expected both animes to contribute accumulated counters, got %#v", run)
	}
	if got := counter.CountAtRoot(folderA); got != 3 {
		t.Fatalf("expected folder A count 3, got %d", got)
	}
	if got := counter.CountAtRoot(folderB); got != 7 {
		t.Fatalf("expected folder B count 7, got %d", got)
	}
}

type catchupCounter struct {
	mu        sync.Mutex
	atRoot    map[string]int
	recursive map[string]int
}

func newCatchupCounter(atRoot map[string]int) *catchupCounter {
	recursive := make(map[string]int, len(atRoot))
	for folder, count := range atRoot {
		recursive[folder] = count
	}
	return &catchupCounter{atRoot: atRoot, recursive: recursive}
}

func (c *catchupCounter) CountAtRoot(folder string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.atRoot[folder]
}

func (c *catchupCounter) CountRecursive(folder string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.recursive[folder]
}

func (c *catchupCounter) markRecursiveDownloaded(folder string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.recursive[folder] = c.atRoot[folder] + 1
}

func (c *catchupCounter) Flatten(folder string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.recursive[folder] > c.atRoot[folder] {
		c.atRoot[folder] = c.recursive[folder]
	}
}

var _ filesystem.EpisodeCounter = (*catchupCounter)(nil)

type recordingCatchupJD struct {
	svcFakeJDClient
	counter *catchupCounter
	mu      sync.Mutex
	seen    []int
}

func (j *recordingCatchupJD) AddAndStart(ctx context.Context, deviceName string, req jdownloader.EnqueueRequest) error {
	episode := episodeFromURL(req.URLs[0])
	j.mu.Lock()
	j.seen = append(j.seen, episode)
	j.mu.Unlock()
	j.counter.markRecursiveDownloaded(req.Destination)
	return nil
}

func (j *recordingCatchupJD) episodes() []int {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := make([]int, len(j.seen))
	copy(out, j.seen)
	return out
}

func episodeFromURL(raw string) int {
	parts := strings.Split(strings.TrimRight(raw, "/"), "/")
	n, _ := strconv.Atoi(parts[len(parts)-1])
	return n
}

func equalInts(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
