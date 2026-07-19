package download

import (
	"context"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
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

func TestRunAnimePersistsEpisodeProgressDuringSingleAnimeCatchup(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/solo/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
			"https://jkanime.net/solo/2/": {{URL: "http://mediafire.example/2", Hoster: "Mediafire"}},
			"https://jkanime.net/solo/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	counter := newCatchupCounter(map[string]int{folder: 0})
	deps.Counter = counter
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}
	deps.JD = &recordingCatchupJD{counter: counter}

	anime := contracts.MobileAnime{
		ID:      "anime-1",
		Nombre:  "Solo Anime",
		Activo:  1,
		Pagina:  ptrStr("https://jkanime.net/solo/"),
		Carpeta: ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.AnimesChecked != 1 || run.EpisodesFound != 3 || run.EpisodesDownloaded != 3 {
		t.Fatalf("expected final solo counters to be complete, got %#v", run)
	}

	assertSoloRunProgress(t, deps.Store.(*svcFakeDownloadStore).progressSnapshots())
}

func TestRunAnimeFlattensExistingSubfolderDownloadsBeforeChoosingNextEpisode(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 7, EpisodePageURL: "https://jkanime.net/solo/7/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/7/": {{URL: "http://mediafire.example/7", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	counter := newCatchupCounter(map[string]int{folder: 5})
	counter.setRecursive(folder, 6)
	deps.Counter = counter
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}
	jd := &recordingCatchupJD{counter: counter}
	deps.JD = jd

	anime := contracts.MobileAnime{
		ID:      "anime-1",
		Nombre:  "Solo Anime",
		Activo:  1,
		Pagina:  ptrStr("https://jkanime.net/solo/"),
		Carpeta: ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", result)
	}
	if got, want := jd.episodes(), []int{7}; !equalInts(got, want) {
		t.Fatalf("expected only the truly missing episode to be enqueued, got %v", got)
	}
}

func TestRunAnimeRetriesFlattenUntilDownloadedEpisodeReachesRoot(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	deps.Clock = func() time.Time { return now }
	deps.PollSleep = func(d time.Duration) { now = now.Add(d) }
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 10, EpisodePageURL: "https://jkanime.net/solo/10/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/10/": {{URL: "http://mediafire.example/10", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	counter := newCatchupCounter(map[string]int{folder: 9})
	deps.Counter = counter
	deps.JD = &recordingCatchupJD{counter: counter}
	flattenAttempts := 0
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) {
		flattenAttempts++
		if flattenAttempts > 1 {
			counter.Flatten(folder)
		}
	}}

	anime := contracts.MobileAnime{
		ID:      "anime-1",
		Nombre:  "Solo Anime",
		Activo:  1,
		Pagina:  ptrStr("https://jkanime.net/solo/"),
		Carpeta: ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", result)
	}
	if got := counter.CountAtRoot(folder); got != 10 {
		t.Fatalf("expected final episode to be flattened into root count, got %d", got)
	}
}

func TestRunAnimeCompletesWhenJDFolderFileNameDoesNotContainEpisodeNumber(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	deps.Clock = func() time.Time { return now }
	deps.PollSleep = func(d time.Duration) { now = now.Add(d) }
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 11, EpisodePageURL: "https://jkanime.net/solo/11/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/11/": {{URL: "http://mediafire.example/11", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	counter := newCatchupCounter(map[string]int{folder: 10})
	deps.Counter = counter
	deps.JD = &recordingCatchupJD{counter: counter}
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}

	anime := contracts.MobileAnime{
		ID:      "anime-1",
		Nombre:  "Solo Anime",
		Activo:  1,
		Pagina:  ptrStr("https://jkanime.net/solo/"),
		Carpeta: ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected ok result, got %#v", result)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.EpisodesFound != 1 || run.EpisodesDownloaded != 1 || run.EpisodesFailed != 0 {
		t.Fatalf("expected one found and one downloaded episode, got %#v", run)
	}
}

func TestRunAnimeCompletesFromFilesystemWhenJDPackageStateIsNotReliable(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	deps.Clock = func() time.Time { return now }
	deps.PollSleep = func(d time.Duration) { now = now.Add(d) }
	folder := t.TempDir()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/solo/": {LatestEpisode: 11, EpisodePageURL: "https://jkanime.net/solo/11/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/solo/11/": {{URL: "http://mediafire.example/11", Hoster: "Mediafire"}},
		},
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	counter := newCatchupCounter(map[string]int{folder: 10})
	deps.Counter = counter
	deps.JD = &neverFinishedCatchupJD{recordingCatchupJD: recordingCatchupJD{counter: counter}}
	deps.Flattener = &svcFakeFlattener{onFlatten: func(folder string) { counter.Flatten(folder) }}

	anime := contracts.MobileAnime{
		ID:      "anime-1",
		Nombre:  "Solo Anime",
		Activo:  1,
		Pagina:  ptrStr("https://jkanime.net/solo/"),
		Carpeta: ptrStr(folder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("expected ok result even when JD package status is unreliable, got %#v", result)
	}
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.EpisodesFound != 1 || run.EpisodesDownloaded != 1 || run.EpisodesFailed != 0 {
		t.Fatalf("expected filesystem-confirmed completion, got %#v", run)
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
