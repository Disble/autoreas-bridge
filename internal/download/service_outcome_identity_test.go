package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
)

// The channel-based fan-out collapses every anime's outcome into two run-wide booleans
// (anyFailed/anySucceeded). A producer that wants to name which anime failed or needed a manual
// download needs the outcomes themselves, not just the booleans -- this is the plumbing slice
// (6a) that keeps identity alive through that collapse for the later producer-enrichment slice
// (6b) to consume.
func TestSummarizeAnimeOutcomesCollectsEveryOutcomeWithItsAnimeIdentity(t *testing.T) {
	t.Parallel()

	outcomes := make(chan animeRunOutcome, 2)
	outcomes <- animeRunOutcome{animeID: "anime-1", animeName: "First Anime", episodesDownloaded: 1}
	outcomes <- animeRunOutcome{animeID: "anime-2", animeName: "Second Anime", failed: true, failureKind: FailureKindHosterDown}
	close(outcomes)

	anyFailed, anySucceeded, collected := summarizeAnimeOutcomes(outcomes)

	if !anyFailed || !anySucceeded {
		t.Fatalf("anyFailed=%v anySucceeded=%v, want both true", anyFailed, anySucceeded)
	}
	if len(collected) != 2 {
		t.Fatalf("collected %d outcomes, want 2 -- dropping one must fail this test", len(collected))
	}

	byAnimeID := map[string]animeRunOutcome{}
	for _, outcome := range collected {
		byAnimeID[outcome.animeID] = outcome
	}
	if got := byAnimeID["anime-1"].animeName; got != "First Anime" {
		t.Fatalf("collected[anime-1].animeName = %q, want %q", got, "First Anime")
	}
	if got := byAnimeID["anime-2"].animeName; got != "Second Anime" {
		t.Fatalf("collected[anime-2].animeName = %q, want %q", got, "Second Anime")
	}
	if got := byAnimeID["anime-2"].failureKind; got != FailureKindHosterDown {
		t.Fatalf("collected[anime-2].failureKind = %q, want %q", got, FailureKindHosterDown)
	}
}

// The unit test above proves the reducer itself preserves identity; this proves the real
// construction sites (prepareAnimeDownload's success path and episodeListFailure's failure path)
// actually stamp that identity in the first place, through a real concurrent fan-out -- so a
// regression at either origin, not just at the reducer, fails a test.
func TestProcessAnimesCollectedOutcomesCarryAnimeIdentityThroughARealFanOut(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)

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
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{okFolder: 4}, recursive: map[string]int{okFolder: 5}})

	animes := []contracts.MobileAnime{
		{ID: "anime-ok", Name: "OK Anime", SourceURL: new("https://jkanime.net/ok-anime/"), Folder: new(okFolder)},
		{ID: "anime-broken", Name: "Broken Anime", SourceURL: new("https://jkanime.net/broken-anime/"), Folder: new(t.TempDir())},
	}

	svc := NewService(deps)
	_, _, collected := svc.processAnimes(context.Background(), "run-1", animes, fixedJDGate(true), func(animeProgressDelta) {})

	if len(collected) != 2 {
		t.Fatalf("collected %d outcomes, want 2 (one per anime -- dropping one must fail this test)", len(collected))
	}

	byAnimeID := map[string]animeRunOutcome{}
	for _, outcome := range collected {
		byAnimeID[outcome.animeID] = outcome
	}

	ok, found := byAnimeID["anime-ok"]
	if !found {
		t.Fatal("no collected outcome for anime-ok")
	}
	if ok.animeName != "OK Anime" || ok.failed {
		t.Fatalf("anime-ok outcome = %#v, want animeName=%q failed=false", ok, "OK Anime")
	}

	broken, found := byAnimeID["anime-broken"]
	if !found {
		t.Fatal("no collected outcome for anime-broken")
	}
	if broken.animeName != "Broken Anime" || !broken.failed {
		t.Fatalf("anime-broken outcome = %#v, want animeName=%q failed=true", broken, "Broken Anime")
	}
}

func TestSummarizeManualLinksNamesEachAnimeAndTruncatesPastTheLimit(t *testing.T) {
	t.Parallel()

	t.Run("under the limit, every anime is named", func(t *testing.T) {
		t.Parallel()
		links := []ManualLink{{Anime: "First Anime", Episode: 3}, {Anime: "Second Anime", Episode: 7}}
		got := summarizeManualLinks(links, 5)
		want := "First Anime (ep 3), Second Anime (ep 7)"
		if got != want {
			t.Fatalf("summarizeManualLinks() = %q, want %q", got, want)
		}
	})

	t.Run("past the limit, the remainder collapses into a count", func(t *testing.T) {
		t.Parallel()
		links := make([]ManualLink, 0, 3)
		for i := 1; i <= 3; i++ {
			links = append(links, ManualLink{Anime: "Anime", Episode: i})
		}
		got := summarizeManualLinks(links, 2)
		want := "Anime (ep 1), Anime (ep 2) (+1 more)"
		if got != want {
			t.Fatalf("summarizeManualLinks() = %q, want %q", got, want)
		}
	})
}
