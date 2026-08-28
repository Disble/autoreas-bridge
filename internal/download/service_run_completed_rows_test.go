package download

import (
	"context"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/notification"
)

// cleanMixedRunScenario wires two anime scheduled for today: one with a single downloadable
// episode (5, with 4 already on disk) and one that is already current. Nothing fails, so RunOnce
// settles on "ok" -- the exact run the user opened and found empty.
func cleanMixedRunScenario(t *testing.T) (ServiceDeps, *svcFakeNotifier) {
	t.Helper()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/ok-anime/":      {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/ok-anime/5/"},
			"https://jkanime.net/current-anime/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/current-anime/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/ok-anime/5/": {{URL: "http://mediafire.example/5", Hoster: "Mediafire"}},
		},
	})
	deps.Sites = registry

	okFolder := t.TempDir()
	currentFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID: "anime-ok", Name: "OK Anime", Active: 1,
			Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
			SourceURL: new("https://jkanime.net/ok-anime/"), Folder: new(okFolder),
		},
		{
			ID: "anime-current", Name: "Current Anime", Active: 1,
			Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 1}},
			SourceURL: new("https://jkanime.net/current-anime/"), Folder: new(currentFolder),
		},
	}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{okFolder: 4, currentFolder: 3},
		recursive: map[string]int{okFolder: 5, currentFolder: 3},
	})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	return deps, notifier
}

// rowByRefID returns the detail row referencing refID.
func rowByRefID(rows []notification.DetailItem, refID string) (notification.DetailItem, bool) {
	for _, row := range rows {
		if row.RefID == refID {
			return row, true
		}
	}
	return notification.DetailItem{}, false
}

// collapsedRow returns the trailing summary row, if the notification carries one.
func collapsedRow(rows []notification.DetailItem) (notification.DetailItem, bool) {
	for _, row := range rows {
		if row.CollapsedCount > 0 {
			return row, true
		}
	}
	return notification.DetailItem{}, false
}

// TestRunCompletedNotificationNamesWhatItDownloaded is the regression this slice exists for: a
// fully successful run used to attach no rows at all, so the detail pane showed a title, a
// sentence and a correlation id. What downloaded is exactly what the pane must name.
func TestRunCompletedNotificationNamesWhatItDownloaded(t *testing.T) {
	t.Parallel()

	deps, notifier := cleanMixedRunScenario(t)
	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "Download run completed")
	if !found {
		t.Fatalf("no run_completed notification in %#v", notifier.notifications())
	}
	if len(sent.Rows) != 3 {
		t.Fatalf("Rows = %#v, want exactly 3 (the downloaded anime + 1 summary + the up-to-date anime it heads)", sent.Rows)
	}

	downloaded, ok := rowByRefID(sent.Rows, "anime-ok")
	if !ok {
		t.Fatalf("no row for the anime that downloaded episodes: %#v", sent.Rows)
	}
	if downloaded.Name != "OK Anime" {
		t.Fatalf("downloaded row Name = %q, want %q", downloaded.Name, "OK Anime")
	}
	if downloaded.Status != "downloaded" {
		t.Fatalf("downloaded row Status = %q, want %q", downloaded.Status, "downloaded")
	}
	if !strings.Contains(downloaded.Detail, "Episode 5") {
		t.Fatalf("downloaded row Detail = %q, want it to name episode 5", downloaded.Detail)
	}
	if !strings.Contains(downloaded.Detail, "ready to watch") {
		t.Fatalf("downloaded row Detail = %q, want it to say the episodes are ready to watch", downloaded.Detail)
	}

	summary, ok := collapsedRow(sent.Rows)
	if !ok {
		t.Fatalf("no summary row heading the up-to-date anime: %#v", sent.Rows)
	}
	if summary.CollapsedCount != 1 {
		t.Fatalf("summary row CollapsedCount = %d, want exactly 1 (only the up-to-date anime is under it)", summary.CollapsedCount)
	}

	// The point of the whole slice, asserted end to end: the quiet anime reaches the record by
	// name. It used to be counted into the summary line and discarded, and the "show all in
	// Downloads" way out pointed at a screen that persists only aggregate run counters.
	current, ok := rowByRefID(sent.Rows, "anime-current")
	if !ok {
		t.Fatalf("no row for the up-to-date anime: %#v", sent.Rows)
	}
	if current.Name != "Current Anime" || current.Status != "up to date" {
		t.Fatalf("up-to-date row = %#v, want Name=%q Status=%q", current, "Current Anime", "up to date")
	}
}

// TestRunCompletedNotificationOffersToWatchWhatItDownloaded proves the rows are wired through the
// outcome-aware notify helper, not attached by hand: the helper is what mints the per-row token,
// so a run_completed that named its anime but offered nothing to do with them would fail here.
//
// It used to assert the opposite. A run that finished cleanly offered "Run this anime again" on
// the very anime whose episode was already on disk, and this test held that in place -- which is
// how a category error survives a green suite. The episode is downloaded; the verb is to go watch
// it (docs/notification-cta-policy.md).
func TestRunCompletedNotificationOffersToWatchWhatItDownloaded(t *testing.T) {
	t.Parallel()

	deps, notifier := cleanMixedRunScenario(t)
	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "Download run completed")
	if !found {
		t.Fatalf("no run_completed notification in %#v", notifier.notifications())
	}

	bound := 0
	for _, action := range sent.Actions {
		if action.RowRef != "anime-ok" {
			continue
		}
		if action.Label == "Run this anime again" {
			t.Fatalf("a clean run offers to re-download what it just downloaded: %#v", action)
		}
		if action.Label == "Watch" && action.Args["route"] == "/catalog/detail/anime-ok" {
			bound++
		}
	}
	if bound != 1 {
		t.Fatalf("Actions = %#v, want exactly one watch token bound to anime-ok", sent.Actions)
	}
}

// TestSingleAnimeRunCompletedNotificationNamesWhatItDownloaded covers the RunAnime status
// ladder, which is an independent switch from RunOnce's: the fan-out test above proves nothing
// about it.
func TestSingleAnimeRunCompletedNotificationNamesWhatItDownloaded(t *testing.T) {
	t.Parallel()

	deps := cleanRunScenarioWithNotifier(t)
	notifier := deps.Notifier.(*svcFakeNotifier)
	anime := deps.Animes.(*svcFakeAnimeQuery).animes[0]

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "Download run completed")
	if !found {
		t.Fatalf("no run_completed notification in %#v", notifier.notifications())
	}
	if len(sent.Rows) != 1 {
		t.Fatalf("Rows = %#v, want exactly 1 -- the single anime that downloaded", sent.Rows)
	}
	row := sent.Rows[0]
	if row.RefID != "anime-ok" || row.Name != "OK Anime" || row.Status != "downloaded" {
		t.Fatalf("row = %#v, want RefID=%q Name=%q Status=%q", row, "anime-ok", "OK Anime", "downloaded")
	}
	if !strings.Contains(row.Detail, "Episode 5") {
		t.Fatalf("row Detail = %q, want it to name episode 5", row.Detail)
	}
}

// TestStoppedRunNotificationNamesWhatItDownloadedBeforeStopping pins the third gap: a stopped
// run is not one of the six kinds the design canvas leaves without a detail block, so what it
// managed to download before the stop must still be named. markCanceled is invoked directly, the
// way AGENTS.md prescribes for a branch a race decides.
func TestStoppedRunNotificationNamesWhatItDownloadedBeforeStopping(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	run := Run{RunID: "run-1", EpisodesDownloaded: 2}
	outcomes := []animeRunOutcome{
		{
			animeID: "anime-stopped", animeName: "Stopped Anime", checked: true, episodesDownloaded: 2,
			firstEpisodeDownloaded: 1, lastEpisodeDownloaded: 2,
		},
		{animeID: "anime-current", animeName: "Current Anime", checked: true, upToDate: true},
	}
	if !NewService(deps).markCanceled(ctx, "run-1", &run, outcomes) {
		t.Fatal("markCanceled reported no cancellation for an already-cancelled context")
	}

	sent, found := notificationWithTitle(notifier, "Download run stopped")
	if !found {
		t.Fatalf("no stopped-run notification in %#v", notifier.notifications())
	}
	// First row, above any heading: a stop leaves an anime with episodes on disk but no
	// episodesFound recorded, and "finished without incident" is not what happened to it.
	if sent.Rows[0].RefID != "anime-stopped" {
		t.Fatalf("Rows = %#v, want the anime that downloaded before the stop named first, not filed under the quiet heading", sent.Rows)
	}
	stopped, ok := rowByRefID(sent.Rows, "anime-stopped")
	if !ok {
		t.Fatalf("no row for the anime that downloaded before the stop: %#v", sent.Rows)
	}
	if stopped.Name != "Stopped Anime" || stopped.Status != "downloaded" {
		t.Fatalf("row = %#v, want Name=%q Status=%q", stopped, "Stopped Anime", "downloaded")
	}
	if !strings.Contains(stopped.Detail, "Episodes 1-2") {
		t.Fatalf("row Detail = %q, want it to name episodes 1-2", stopped.Detail)
	}
}

// TestSingleAnimeRunThatDownloadedNothingSendsNoRunCompletedNotification pins the guard that
// keeps the success notification honest. A single-anime run whose anime was already current
// finishes "ok" having done nothing, and a "Download run completed" toast reading "0 episode(s)
// downloaded" would be a claim about work that never happened. Confirmed by mutation: the
// `run.EpisodesDownloaded > 0` guard on the RunAnime ladder survived every existing test.
func TestSingleAnimeRunThatDownloadedNothingSendsNoRunCompletedNotification(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/current-anime/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/current-anime/3/"},
		},
	})
	deps.Sites = registry

	currentFolder := t.TempDir()
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{currentFolder: 3},
		recursive: map[string]int{currentFolder: 3},
	})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{
		ID: "anime-current", Name: "Current Anime",
		SourceURL: new("https://jkanime.net/current-anime/"), Folder: new(currentFolder),
	}

	result, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime)
	if err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	if result.Status != "ok" {
		t.Fatalf("status = %q, want %q", result.Status, "ok")
	}
	if _, found := notificationWithTitle(notifier, "Download run completed"); found {
		t.Fatalf("a run that downloaded nothing announced a completed download: %#v", notifier.notifications())
	}
}
