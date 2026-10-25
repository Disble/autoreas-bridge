package download

import (
	"context"
	"errors"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

// jdOfflineScenario wires one anime that is 8 episodes behind (4 on disk, 12
// online) with every episode resolvable, and MyJDownloader reporting offline.
func jdOfflineScenario(t *testing.T) (ServiceDeps, string) {
	t.Helper()
	deps := baseDeps(t)
	folder := t.TempDir()
	extract := map[string][]sites.DownloadLink{}
	for episode := 5; episode <= 12; episode++ {
		url := "https://jkanime.net/offline/" + strconv.Itoa(episode) + "/"
		extract[url] = []sites.DownloadLink{{URL: "http://mediafire.example/x", Hoster: "Mediafire"}}
	}
	source := &svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/offline/": {LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/offline/12/"}},
		extractLinks: extract,
	}
	registry := NewStaticRegistry()
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "NegaPosi Angler",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: todayDiaName(deps.Clock()), Order: 0}},
		SourceURL: new("https://jkanime.net/offline/"),
		Folder:    new(folder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 4}})
	deps.JD = &svcFakeJDClient{ensureOnlineErr: ErrJDOffline}
	return deps, folder
}

// An offline JDownloader means nothing can be downloaded, so the run must stop
// at the first missing episode instead of walking the whole backlog. Walking it
// used to log a fabricated on-disk count that climbed 4 -> 11 without a single
// file being written, and handed the user a menu of episodes to fetch by hand --
// picking any but the next one leaves a gap the disk-derived counter cannot
// represent, because a later episode on disk makes every earlier one look done.
func TestRunOnceStopsAtTheFirstMissingEpisodeWhenJDIsOffline(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	recorder := &fieldsRecorder{}
	deps.Logger = recorder

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if result.Status != RunStatusJDOffline {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusJDOffline)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("run %q not persisted", result.RunID)
	}
	if len(run.ManualLinks) != 1 {
		t.Fatalf("manual links = %#v, want exactly one for the next missing episode", run.ManualLinks)
	}
	if run.ManualLinks[0].Episode != 5 {
		t.Fatalf("manual link episode = %d, want 5 (the only episode the counter can accept next)", run.ManualLinks[0].Episode)
	}
	if run.ManualLinks[0].AnimeID != "anime-1" || run.ManualLinks[0].Anime != "NegaPosi Angler" {
		t.Fatalf("manual link = %#v, want it to name anime-1 by id and by name", run.ManualLinks[0])
	}
	// The backlog size stays honest: 8 episodes really are missing.
	if run.EpisodesFound != 8 {
		t.Fatalf("episodes found = %d, want 8", run.EpisodesFound)
	}
	if run.EpisodesDownloaded != 0 || run.EpisodesFailed != 0 {
		t.Fatalf("run = %#v, want nothing downloaded and nothing failed", run)
	}
	assertAnimeEntry(t, recorder.only(t, "download.anime_checked"), logger.LevelInfo,
		map[string]any{"onDiskCount": 4, "latestOnline": 12, "missingEpisodes": 8, "animeName": "NegaPosi Angler"})
	assertAnimeEntry(t, recorder.only(t, "download.manual_link_offered"), logger.LevelInfo,
		map[string]any{"episode": 5, "linkCount": 1, "animeName": "NegaPosi Angler"})
	assertEveryAnimeEntryNamesItsAnime(t, recorder.all(), "NegaPosi Angler")
}

// assertAnimeEntry pins an entry about anime-1: the download domain, its level and its exact
// metadata.
func assertAnimeEntry(t *testing.T, entry recordedEntry, level string, metadata map[string]any) {
	t.Helper()
	if entry.domain != "download" || entry.level != level || entry.entityID != "anime-1" {
		t.Fatalf("%s = domain %q level %q entity %q, want download/%s/anime-1", entry.eventType, entry.domain, entry.level, entry.entityID, level)
	}
	if !reflect.DeepEqual(entry.metadata, metadata) {
		t.Fatalf("%s metadata = %#v, want %#v", entry.eventType, entry.metadata, metadata)
	}
}

// assertEveryAnimeEntryNamesItsAnime checks that every entry about one anime carries its name, so
// a run story can label each anime without a catalog lookup. An empty animeName means the anime
// has none, and every entry must then omit the key rather than record an empty value.
func assertEveryAnimeEntryNamesItsAnime(t *testing.T, entries []recordedEntry, animeName string) {
	t.Helper()
	perAnime := 0
	for _, entry := range entries {
		if entry.entityID == "" {
			continue
		}
		perAnime++
		if got, ok := entry.metadata["animeName"]; ok != (animeName != "") || (ok && got != animeName) {
			t.Fatalf("%s metadata = %#v, want animeName %q", entry.eventType, entry.metadata, animeName)
		}
	}
	if perAnime == 0 {
		t.Fatal("expected the run to log at least one entry about its anime")
	}
}

// The clearest proof the cursor no longer walks: episode availability is
// resolved once, not once per missing episode. The anime here has no name, so
// no entry about it may carry an empty animeName.
func TestRunOnceResolvesOnlyOneEpisodeWhenJDIsOffline(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	deps.Animes.(*svcFakeAnimeQuery).animes[0].Name = ""
	recorder := &fieldsRecorder{}
	deps.Logger = recorder

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("run: %v", err)
	}

	recorder.only(t, "download.episode_available")
	assertEveryAnimeEntryNamesItsAnime(t, recorder.all(), "")
}

// The third walk-forward path: the site adapter cannot even build the episode's
// page URL. It must stop at that episode like every other non-download outcome.
func TestRunOnceStopsWhenAnEpisodePageCannotBeResolved(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/offline/": {LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/offline/12/"}},
		pageURLErr:   map[int]error{5: errors.New("episode 5 page unresolvable")},
	})
	deps.Sites = registry
	recorder := &fieldsRecorder{}
	deps.Logger = recorder

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("run %q not persisted", result.RunID)
	}
	if run.EpisodesFailed != 1 {
		t.Fatalf("episodes failed = %d, want exactly 1 -- more means it walked the backlog", run.EpisodesFailed)
	}
	assertAnimeEntry(t, recorder.only(t, "download.failed"), logger.LevelError,
		map[string]any{"failureKind": "hoster_down", "episode": 5, "animeName": "NegaPosi Angler"})
}

// The single-anime path (RunAnime) shares the same jd_offline enrichment as the fan-out path:
// the notification must name the anime whose episode needs a manual download, not just say
// "see run details".
func TestRunAnimeJDOfflineNotificationNamesTheAffectedAnime(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := deps.Animes.(*svcFakeAnimeQuery).animes[0]

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	if result.Status != RunStatusJDOffline {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusJDOffline)
	}

	body := ""
	for _, n := range notifier.notifications() {
		if n.Level == notification.LevelWarning && n.Title == "MyJDownloader offline" {
			body = n.Body
		}
	}
	if body == "" {
		t.Fatal("no jd_offline notification found")
	}
	if !strings.Contains(body, "NegaPosi Angler") {
		t.Fatalf("jd_offline body = %q, want it to name the affected anime", body)
	}
	if strings.Contains(body, "see run details") {
		t.Fatalf("jd_offline body = %q, still relies on the literal fallback wording", body)
	}
}

// An offline gate is not a reason to keep going after a resolution failure
// either: that was the second path that advanced the cursor without downloading.
func TestRunOnceStopsOnALinkFailureEvenWhileJDIsOffline(t *testing.T) {
	t.Parallel()

	deps, folder := jdOfflineScenario(t)
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name:         "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{"https://jkanime.net/offline/": {LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/offline/12/"}},
		extractErr:   map[string]error{"https://jkanime.net/offline/5/": errors.New("episode 5 links unavailable")},
	})
	deps.Sites = registry
	recorder := &fieldsRecorder{}
	deps.Logger = recorder

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("run %q not persisted", result.RunID)
	}
	if run.EpisodesFailed != 1 {
		t.Fatalf("episodes failed = %d, want 1 (folder %q)", run.EpisodesFailed, folder)
	}
	if len(run.ManualLinks) != 0 {
		t.Fatalf("manual links = %#v, want none when the links could not be resolved", run.ManualLinks)
	}
	assertAnimeEntry(t, recorder.only(t, "download.episode_available"), logger.LevelInfo,
		map[string]any{"episode": 5, "animeName": "NegaPosi Angler"})
	assertAnimeEntry(t, recorder.only(t, "download.failed"), logger.LevelError,
		map[string]any{"failureKind": "hoster_down", "episode": 5, "animeName": "NegaPosi Angler"})
	if got := len(recorder.byEventType("download.manual_link_offered")); got != 0 {
		t.Fatalf("download.manual_link_offered logged %d times, want none without usable links", got)
	}
}
