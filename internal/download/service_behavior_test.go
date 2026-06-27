package download

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

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
		ID:      "anime-1",
		Nombre:  "Some Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/anime/"),
		Carpeta: ptrStr(destFolder),
	}}}
	deps.Hosters = &svcFakeHosterResolver{order: []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}, {Hoster: "Mega", Priority: 1, Enabled: true}}}
	jd := &svcFakeJDClient{}
	deps.JD = &fallbackAwareJDClient{svcFakeJDClient: jd, failHoster: "Mediafire"}
	deps.Counter = &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}}

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
		ID:      "anime-movie",
		Nombre:  "A Movie",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Tipo:    ptrInt(1),
		Pagina:  ptrStr("https://jkanime.net/movie/"),
		Carpeta: ptrStr(t.TempDir()),
	}, {
		ID:     "anime-no-folder",
		Nombre: "No Folder Anime",
		Activo: 1,
		Dias:   []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina: ptrStr("https://jkanime.net/no-folder/"),
	}, {
		ID:      "anime-serie",
		Nombre:  "A Serie",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/serie/"),
		Carpeta: ptrStr(destFolder),
	}}}
	deps.Counter = &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}}

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
	var _ contracts.AnimeQueryService = deps.Animes
	if _, isWriter := deps.Animes.(contracts.AnimeWriteService); isWriter {
		t.Fatal("ServiceDeps.Animes must not also satisfy AnimeWriteService -- download is read-only")
	}
}
