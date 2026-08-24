package download

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

// TestNoProducerNotificationBodyStillSaysSeeRunDetails is the cross-cutting wording guard
// (notification-center spec, per-anime individuation): every producer site this change touched --
// the two jd_offline sites 6a already enriched, plus the four run_partial/run_failed sites 6b
// enriches -- must have replaced the literal "see run details" fallback with an individually
// identified row. A regression at ANY of the six sites fails this one test, instead of only the
// scenario-specific test that happens to cover it.
func TestNoProducerNotificationBodyStillSaysSeeRunDetails(t *testing.T) {
	t.Parallel()

	scenarios := map[string]func(t *testing.T) string{
		"jd_offline fan-out (RunOnce)":        jdOfflineFanOutBody,
		"jd_offline single-anime (RunAnime)":  jdOfflineSingleAnimeBody,
		"run_partial fan-out (RunOnce)":       runPartialFanOutBody,
		"run_failed fan-out (RunOnce)":        runFailedFanOutBody,
		"run_partial single-anime (RunAnime)": runPartialSingleAnimeBody,
		"run_failed single-anime (RunAnime)":  runFailedSingleAnimeBody,
	}

	for name, build := range scenarios {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			body := build(t)
			if body == "" {
				t.Fatalf("%s: no matching notification found", name)
			}
			if strings.Contains(body, "see run details") {
				t.Fatalf("%s: body = %q, still relies on the literal fallback wording", name, body)
			}
		})
	}
}

// jdOfflineFanOutBody runs the jd_offline scenario through RunOnce and returns the
// "MyJDownloader offline" notification body.
func jdOfflineFanOutBody(t *testing.T) string {
	t.Helper()
	deps, _ := jdOfflineScenario(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	got := findNotificationByTitle(notifier, "MyJDownloader offline")
	if got == nil {
		return ""
	}
	return got.Body
}

// jdOfflineSingleAnimeBody runs the jd_offline scenario through RunAnime and returns the
// "MyJDownloader offline" notification body.
func jdOfflineSingleAnimeBody(t *testing.T) string {
	t.Helper()
	deps, _ := jdOfflineScenario(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := deps.Animes.(*svcFakeAnimeQuery).animes[0]
	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	got := findNotificationByTitle(notifier, "MyJDownloader offline")
	if got == nil {
		return ""
	}
	return got.Body
}

// runPartialFanOutBody runs a 1-ok/1-broken fan-out through RunOnce and returns the run_partial
// notification body.
func runPartialFanOutBody(t *testing.T) string {
	t.Helper()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/wording-ok/": {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/wording-ok/5/"},
		},
		listErr: map[string]error{
			"https://jkanime.net/wording-broken/": errors.New("boom: site scrape failed"),
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/wording-ok/5/": {{URL: "http://mediafire.example/5", Hoster: "Mediafire"}},
		},
	})
	deps.Sites = registry

	okFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "wording-ok", Name: "Wording OK Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/wording-ok/"), Folder: ptrStr(okFolder)},
		{ID: "wording-broken", Name: "Wording Broken Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/wording-broken/"), Folder: ptrStr(t.TempDir())},
	}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{okFolder: 4}, recursive: map[string]int{okFolder: 5}})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	got := findNotificationByTitle(notifier, "Download run completed with errors")
	if got == nil {
		return ""
	}
	return got.Body
}

// runFailedFanOutBody runs an all-broken fan-out through RunOnce and returns the run_failed
// notification body.
func runFailedFanOutBody(t *testing.T) string {
	t.Helper()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listErr: map[string]error{
			"https://jkanime.net/wording-broken-only/": errors.New("boom: site scrape failed"),
		},
	})
	deps.Sites = registry

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "wording-broken-only", Name: "Wording Broken Only Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/wording-broken-only/"), Folder: ptrStr(t.TempDir())},
	}}
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	got := findNotificationByTitle(notifier, "Download run failed")
	if got == nil {
		return ""
	}
	return got.Body
}

// runPartialSingleAnimeBody runs a single anime that downloads one episode then fails on the
// next through RunAnime and returns the run_partial notification body.
func runPartialSingleAnimeBody(t *testing.T) string {
	t.Helper()
	deps := baseDeps(t)
	folder := t.TempDir()
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/wording-flaky/": {LatestEpisode: 2, EpisodePageURL: "https://jkanime.net/wording-flaky/2/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/wording-flaky/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
		extractErr: map[string]error{
			"https://jkanime.net/wording-flaky/2/": errors.New("boom: episode 2 links unavailable"),
		},
	})
	deps.Sites = registry
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 1}})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{ID: "wording-flaky", Name: "Wording Flaky Anime", SourceURL: ptrStr("https://jkanime.net/wording-flaky/"), Folder: ptrStr(folder)}

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	got := findNotificationByTitle(notifier, "Download run completed with errors")
	if got == nil {
		return ""
	}
	return got.Body
}

// runFailedSingleAnimeBody runs a single anime whose episode listing fails outright through
// RunAnime and returns the run_failed notification body.
func runFailedSingleAnimeBody(t *testing.T) string {
	t.Helper()
	deps := baseDeps(t)
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listErr: map[string]error{
			"https://jkanime.net/wording-dead/": errors.New("boom: site scrape failed"),
		},
	})
	deps.Sites = registry
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{ID: "wording-dead", Name: "Wording Dead Anime", SourceURL: ptrStr("https://jkanime.net/wording-dead/"), Folder: ptrStr(t.TempDir())}

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	got := findNotificationByTitle(notifier, "Download run failed")
	if got == nil {
		return ""
	}
	return got.Body
}
