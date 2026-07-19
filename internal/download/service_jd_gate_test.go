package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

// errTestListFailure simulates an episode-listing failure for the "all animes fail" gate test.
var errTestListFailure = errors.New("boom: list episodes failed")

// TestRunOnceUpToDateAnimeNeverLaunchesJDownloader is the regression test for the bug: a
// scheduled run where every active anime is already up to date on disk must never call
// EnsureOnline (which auto-launches the JDownloader exe) because no episode is ever missing.
func TestRunOnceUpToDateAnimeNeverLaunchesJDownloader(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/current/": {LatestEpisode: 4, EpisodePageURL: "https://jkanime.net/current/4/"},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	currentFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-current",
		Nombre:  "Up To Date Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/current/"),
		Carpeta: ptrStr(currentFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{currentFolder: 4}, recursive: map[string]int{currentFolder: 4}})
	jd := &svcFakeJDClient{}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected status %q, got %q", RunStatusOK, result.Status)
	}
	if calls := jd.ensureOnlineCallCount(); calls != 0 {
		t.Fatalf("expected EnsureOnline to never be called for an up-to-date run, got %d calls", calls)
	}
}

// TestRunOnceMissingEpisodeCallsEnsureOnlineExactlyOnce verifies the gate resolves lazily but
// exactly once when a single anime has a missing episode.
func TestRunOnceMissingEpisodeCallsEnsureOnlineExactlyOnce(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/fresh/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/fresh/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/fresh/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	freshFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-fresh",
		Nombre:  "Fresh Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/fresh/"),
		Carpeta: ptrStr(freshFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{freshFolder: 0}, recursive: map[string]int{freshFolder: 1}})
	jd := &svcFakeJDClient{}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected status %q, got %q", RunStatusOK, result.Status)
	}
	if calls := jd.ensureOnlineCallCount(); calls != 1 {
		t.Fatalf("expected EnsureOnline to be called exactly once, got %d calls", calls)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if !run.JDAvailable {
		t.Fatalf("expected run.JDAvailable=true once the gate resolved online, got %#v", run)
	}
}

// TestRunOnceConcurrentMissingEpisodesCallEnsureOnlineExactlyOnce runs the fan-out with -race and
// asserts the lazy gate is resolved exactly once even when multiple animes concurrently discover
// a missing episode.
func TestRunOnceConcurrentMissingEpisodesCallEnsureOnlineExactlyOnce(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/one/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/one/1/"},
			"https://jkanime.net/two/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/two/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/one/1/": {{URL: "http://mediafire.example/one/1", Hoster: "Mediafire"}},
			"https://jkanime.net/two/1/": {{URL: "http://mediafire.example/two/1", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	oneFolder := t.TempDir()
	twoFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-one",
		Nombre:  "Anime One",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/one/"),
		Carpeta: ptrStr(oneFolder),
	}, {
		ID:      "anime-two",
		Nombre:  "Anime Two",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/two/"),
		Carpeta: ptrStr(twoFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{oneFolder: 0, twoFolder: 0},
		recursive: map[string]int{oneFolder: 1, twoFolder: 1},
	})
	jd := &svcFakeJDClient{}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected status %q, got %q", RunStatusOK, result.Status)
	}
	if calls := jd.ensureOnlineCallCount(); calls != 1 {
		t.Fatalf("expected EnsureOnline to be called exactly once under concurrent fan-out, got %d calls", calls)
	}
}

// TestRunOnceAllAnimesSkippedNeverLaunchesJDownloader covers the "listing fails / all skipped"
// path: EnsureOnline must never be called, and the existing terminal status must be preserved.
func TestRunOnceAllAnimesSkippedNeverLaunchesJDownloader(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:     "anime-movie",
		Nombre: "A Movie",
		Activo: 1,
		Dias:   []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Tipo:   ptrInt(1),
		Pagina: ptrStr("https://jkanime.net/movie/"),
		// Carpeta intentionally nil -- EvaluateAnimeForDownload skips movies without a folder.
	}}}
	jd := &svcFakeJDClient{}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected status %q, got %q", RunStatusOK, result.Status)
	}
	if calls := jd.ensureOnlineCallCount(); calls != 0 {
		t.Fatalf("expected EnsureOnline to never be called when every anime is skipped, got %d calls", calls)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.JDAvailable {
		t.Fatalf("expected run.JDAvailable=false when the gate never resolves, got %#v", run)
	}
}

// TestRunOnceListingFailureNeverLaunchesJDownloaderAndStaysError covers the "episode listing
// fails" path: no episode was ever discovered as missing, so EnsureOnline must never be called,
// and the existing per-anime-failure terminal status (error, since the only anime failed) must be
// preserved exactly as before.
func TestRunOnceListingFailureNeverLaunchesJDownloaderAndStaysError(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listErr: map[string]error{
			"https://jkanime.net/broken/": errTestListFailure,
		},
	}
	registry.Register(source)
	deps.Sites = registry

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-broken",
		Nombre:  "Broken Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/broken/"),
		Carpeta: ptrStr(t.TempDir()),
	}}}
	jd := &svcFakeJDClient{}
	deps.JD = jd

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusError {
		t.Fatalf("expected status %q, got %q", RunStatusError, result.Status)
	}
	if calls := jd.ensureOnlineCallCount(); calls != 0 {
		t.Fatalf("expected EnsureOnline to never be called when listing fails, got %d calls", calls)
	}
}
