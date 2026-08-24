package download

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
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
		SourceURL: ptrStr("https://jkanime.net/offline/"),
		Folder:    ptrStr(folder),
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
	// The backlog size stays honest: 8 episodes really are missing.
	if run.EpisodesFound != 8 {
		t.Fatalf("episodes found = %d, want 8", run.EpisodesFound)
	}
	if run.EpisodesDownloaded != 0 || run.EpisodesFailed != 0 {
		t.Fatalf("run = %#v, want nothing downloaded and nothing failed", run)
	}
}

// The clearest proof the cursor no longer walks: episode availability is
// resolved once, not once per missing episode.
func TestRunOnceResolvesOnlyOneEpisodeWhenJDIsOffline(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	events := &renameEventRecorder{}
	deps.Logger = events

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := events.count("download.episode_available"); got != 1 {
		t.Fatalf("download.episode_available logged %d times, want 1", got)
	}
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
	events := &renameEventRecorder{}
	deps.Logger = events

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
	if got := events.count("download.failed"); got != 1 {
		t.Fatalf("download.failed logged %d times, want 1", got)
	}
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
	events := &renameEventRecorder{}
	deps.Logger = events

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
	if got := events.count("download.episode_available"); got != 1 {
		t.Fatalf("download.episode_available logged %d times, want 1", got)
	}
}
