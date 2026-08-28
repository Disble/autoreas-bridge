package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
)

func TestRunOnceHappyPathDownloadsAndMarksRunOk(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"}},
		extractLinks: map[string][]sites.DownloadLink{"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}}},
	}
	registry.Register(source)
	deps.Sites = registry
	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{ID: "anime-1", Name: "Some Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: new("https://jkanime.net/anime/"), Folder: new(destFolder)}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected run status %q, got %q", RunStatusOK, result.Status)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
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
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"}},
		extractLinks: map[string][]sites.DownloadLink{"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}}},
	}
	registry.Register(source)
	deps.Sites = registry
	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{ID: "anime-1", Name: "Some Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: new("https://jkanime.net/anime/"), Folder: new(destFolder)}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})

	bus := events.NewBus()
	progressEvents := 0
	bus.Subscribe(events.EventNameDownloadRunProgress, func(events.Event) { progressEvents++ })
	deps.Bus = bus

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
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

func TestRunOnceSurvivesNotifierFailure(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"}},
		extractLinks: map[string][]sites.DownloadLink{"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}}},
	}
	registry.Register(source)
	deps.Sites = registry
	destFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{ID: "anime-1", Name: "Some Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: new("https://jkanime.net/anime/"), Folder: new(destFolder)}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})
	deps.Notifier = &svcFakeNotifier{err: errors.New("notifier transport down")}

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected RunOnce to succeed even when Notifier fails, got %v", err)
	}
	if result.Status != RunStatusOK {
		t.Fatalf("expected run status %q despite notifier failure, got %q", RunStatusOK, result.Status)
	}
}
