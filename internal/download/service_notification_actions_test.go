package download

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/notification"
)

// findActionByIntent returns the single action carrying intent, failing the test unless exactly
// one exists. Intents are written as literals here, never as the production constant, so a
// renamed constant cannot move both sides of the comparison at once.
func findActionByIntent(t *testing.T, actions []notification.ActionSpec, intent string) notification.ActionSpec {
	t.Helper()
	var found []notification.ActionSpec
	for _, action := range actions {
		if action.Intent == intent {
			found = append(found, action)
		}
	}
	if len(found) != 1 {
		t.Fatalf("actions carrying intent %q = %#v, want exactly 1", intent, found)
	}
	return found[0]
}

// TestRunWideActionsIsTheOpenDownloadsTokenAlone pins the whole-notification half of the two
// levels: a token with NO row binding, addressed at the downloads route.
func TestRunWideActionsIsTheOpenDownloadsTokenAlone(t *testing.T) {
	t.Parallel()

	actions := runWideActions()

	if len(actions) != 1 {
		t.Fatalf("runWideActions() = %#v, want exactly 1 whole-notification token", actions)
	}
	if actions[0].Intent != "navigation.open" {
		t.Fatalf("intent = %q, want %q", actions[0].Intent, "navigation.open")
	}
	if actions[0].Label != "Open Downloads" {
		t.Fatalf("label = %q, want %q", actions[0].Label, "Open Downloads")
	}
	if actions[0].Args["route"] != "/downloads" {
		t.Fatalf("args = %#v, want the downloads route frozen in", actions[0].Args)
	}
	if actions[0].RowRef != "" {
		t.Fatalf("RowRef = %q, want empty -- this action is about the whole notification", actions[0].RowRef)
	}
}

// TestBuildRunActionsBindsARetryTokenToEveryNamedAnimeRow is the core of Slice D: every anime a
// run named individually must carry its own re-run token, with that anime's id frozen into the
// args and the row binding pointing back at the row.
func TestBuildRunActionsBindsARetryTokenToEveryNamedAnimeRow(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{
		{RefType: "anime", RefID: "anime-failed", Name: "Failed Anime", Status: "failed"},
		{RefType: "anime", RefID: "anime-manual", Name: "Manual Anime", Status: "manual"},
		{Status: "ok", Detail: "6 other anime finished without incident", CollapsedCount: 6},
	}

	actions := buildRunActions(rows)

	var retryRefs []string
	for _, action := range actions {
		if action.Intent != "download.run_anime" {
			continue
		}
		if action.Label != "Run this anime again" {
			t.Fatalf("retry label = %q, want %q", action.Label, "Run this anime again")
		}
		if action.Args["animeId"] != action.RowRef {
			t.Fatalf("action %#v freezes an animeId that does not match its own row binding", action)
		}
		retryRefs = append(retryRefs, action.RowRef)
	}

	if len(retryRefs) != 2 {
		t.Fatalf("retry tokens bound to %#v, want exactly the 2 named anime rows", retryRefs)
	}
	if retryRefs[0] != "anime-failed" || retryRefs[1] != "anime-manual" {
		t.Fatalf("retry tokens bound to %#v, want [anime-failed anime-manual] in row order", retryRefs)
	}
	// The whole-notification token rides along with the per-row ones.
	findActionByIntent(t, actions, "navigation.open")
}

// TestBuildRunActionsNeverBindsARetryTokenToACollapsedRow pins the guard that keeps a summary
// line from growing a button: a collapsed row stands in for anime it does not name, so there is
// no single anime a re-run token could address.
func TestBuildRunActionsNeverBindsARetryTokenToACollapsedRow(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{
		{Status: "ok", Detail: "6 other anime finished without incident", CollapsedCount: 6},
	}

	actions := buildRunActions(rows)

	for _, action := range actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("collapsed-only rows produced a retry token %#v, want none", action)
		}
	}
	if len(actions) != 1 {
		t.Fatalf("actions = %#v, want only the whole-notification token", actions)
	}
}

// TestBuildRunActionsIgnoresANamedRowThatIsNotAnAnime pins the ref-type guard: download.run_anime
// freezes an animeId, so a row referencing anything else must not receive one.
func TestBuildRunActionsIgnoresANamedRowThatIsNotAnAnime(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{
		{RefType: "link", RefID: "link-1", Name: "A hoster link", Status: "manual"},
	}

	actions := buildRunActions(rows)

	for _, action := range actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("a non-anime row produced a retry token %#v, want none", action)
		}
	}
}

// TestBuildRunActionsIgnoresAnAnimeRowWithNoID pins the other half of the same guard. An anime
// row whose id is missing would mint a token frozen on an empty animeId, and GetAnimeDetail("")
// resolves to nothing -- a button that can only ever refuse, which is exactly what the token
// pattern exists to make impossible ("you cannot hold a token to something that does not exist").
func TestBuildRunActionsIgnoresAnAnimeRowWithNoID(t *testing.T) {
	t.Parallel()

	rows := []notification.DetailItem{
		{RefType: "anime", RefID: "", Name: "Anime With No ID", Status: "failed"},
	}

	actions := buildRunActions(rows)

	for _, action := range actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("an anime row with no id produced a retry token %#v, want none", action)
		}
	}
}

// TestPartialRunNotificationCarriesAPerRowRetryToken proves the wiring end to end rather than
// only at the builder: a real partial run must ship a notification whose actions include a
// re-run token bound to the anime row that failed.
func TestPartialRunNotificationCarriesAPerRowRetryToken(t *testing.T) {
	t.Parallel()

	deps, notifier := partialRunScenarioWithNotifier(t)

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "Download run completed with errors")
	if !found {
		t.Fatalf("no partial-run notification in %#v", notifier.notifications())
	}
	retry := findActionByIntent(t, sent.Actions, "download.run_anime")
	if retry.RowRef != "anime-broken" || retry.Args["animeId"] != "anime-broken" {
		t.Fatalf("retry token = %#v, want it bound to the anime row that failed", retry)
	}
	findActionByIntent(t, sent.Actions, "navigation.open")
}

// TestJDOfflineNotificationIndividuatesTheAnimeAsARow closes the second gap in Slice D: the
// jd_offline producer used to attach nothing, so the Anatomy artboard's row for it could never
// render. It carries rows now -- and deliberately no re-run token, because the canvas draws
// copy-hoster actions there and no such intent exists.
func TestJDOfflineNotificationIndividuatesTheAnimeAsARow(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "MyJDownloader offline")
	if !found {
		t.Fatalf("no jd_offline notification in %#v", notifier.notifications())
	}
	if len(sent.Rows) != 1 {
		t.Fatalf("jd_offline rows = %#v, want exactly one row naming the affected anime", sent.Rows)
	}
	if sent.Rows[0].RefID != "anime-1" || sent.Rows[0].Name != "NegaPosi Angler" {
		t.Fatalf("jd_offline row = %#v, want it to individuate the affected anime", sent.Rows[0])
	}
	for _, action := range sent.Actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("jd_offline attached a re-run token %#v; the canvas draws copy-hoster actions there", action)
		}
	}
	findActionByIntent(t, sent.Actions, "navigation.open")
}

// notificationWithTitle returns the last notification the fake notifier received under title.
func notificationWithTitle(notifier *svcFakeNotifier, title string) (notification.Notification, bool) {
	var found notification.Notification
	ok := false
	for _, sent := range notifier.notifications() {
		if sent.Title == title {
			found, ok = sent, true
		}
	}
	return found, ok
}

// partialRunScenarioWithNotifier wires one anime that downloads cleanly and one whose site
// listing fails, so RunOnce settles on "partial" with exactly one named failure row. It mirrors
// TestRunOnceIsolatesPerAnimeFailureAndMarksRunPartial's fixture, with a notifier attached.
func partialRunScenarioWithNotifier(t *testing.T) (ServiceDeps, *svcFakeNotifier) {
	t.Helper()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
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
	})
	deps.Sites = registry

	okFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-ok",
		Name:      "OK Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/ok-anime/"),
		Folder:    ptrStr(okFolder),
	}, {
		ID:        "anime-broken",
		Name:      "Broken Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/broken-anime/"),
		Folder:    ptrStr(t.TempDir()),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{okFolder: 4}, recursive: map[string]int{okFolder: 5}})

	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	return deps, notifier
}

// TestEveryRunNotificationCanBeOpenedInDownloads pins notify's contract rather than one call
// site: every notification a download run raises is ABOUT that run, so all of them carry the
// whole-notification "Open Downloads" token -- the row-less ones (run started) exactly as much
// as the ones that individuate anime.
func TestEveryRunNotificationCanBeOpenedInDownloads(t *testing.T) {
	t.Parallel()

	deps, notifier := partialRunScenarioWithNotifier(t)

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	sent := notifier.notifications()
	if len(sent) < 2 {
		t.Fatalf("notifications = %#v, want at least the run-started and terminal ones", sent)
	}
	rowLess := 0
	for _, notified := range sent {
		findActionByIntent(t, notified.Actions, "navigation.open")
		if len(notified.Rows) == 0 {
			rowLess++
		}
	}
	if rowLess == 0 {
		t.Fatal("no row-less notification in this run, so the guard this test exists for was never exercised")
	}
}

// TestRunAnimeJDOfflineNotificationIndividuatesTheAnimeAsARow mirrors the fan-out assertion on
// the single-anime path: RunAnime has its own status ladder, and its jd_offline branch used to
// attach nothing either.
func TestRunAnimeJDOfflineNotificationIndividuatesTheAnimeAsARow(t *testing.T) {
	t.Parallel()

	deps, _ := jdOfflineScenario(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := deps.Animes.(*svcFakeAnimeQuery).animes[0]

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}

	sent, found := notificationWithTitle(notifier, "MyJDownloader offline")
	if !found {
		t.Fatalf("no jd_offline notification in %#v", notifier.notifications())
	}
	if len(sent.Rows) != 1 || sent.Rows[0].RefID != "anime-1" || sent.Rows[0].Name != "NegaPosi Angler" {
		t.Fatalf("jd_offline rows = %#v, want exactly one row naming the affected anime", sent.Rows)
	}
	for _, action := range sent.Actions {
		if action.Intent == "download.run_anime" {
			t.Fatalf("jd_offline attached a re-run token %#v; the canvas draws copy-hoster actions there", action)
		}
	}
}

// kindOf returns the kind of the last notification sent under title.
func kindOf(t *testing.T, notifier *svcFakeNotifier, title string) string {
	t.Helper()
	sent, found := notificationWithTitle(notifier, title)
	if !found {
		t.Fatalf("no notification titled %q in %#v", title, notifier.notifications())
	}
	return sent.Kind
}

// TestRunNotificationsCarryTheirKind pins the vocabulary the design canvas already names, as
// literals. Kind is a second axis next to Source: every one of these carries source "download",
// so a mutation that reported the source in the kind's place must fail here.
func TestRunNotificationsCarryTheirKind(t *testing.T) {
	t.Parallel()

	deps, notifier := partialRunScenarioWithNotifier(t)

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if got := kindOf(t, notifier, "Download run started"); got != "run_started" {
		t.Fatalf("run-started kind = %q, want %q", got, "run_started")
	}
	if got := kindOf(t, notifier, "Download run completed with errors"); got != "download.run_stopped_early" {
		t.Fatalf("partial-run kind = %q, want %q", got, "download.run_stopped_early")
	}
	for _, sent := range notifier.notifications() {
		if sent.Kind == "" {
			t.Fatalf("notification %q carries no kind", sent.Title)
		}
		if sent.Kind == sent.Source {
			t.Fatalf("notification %q reports its source %q as its kind", sent.Title, sent.Kind)
		}
	}
}

// TestJDOfflineNotificationCarriesTheJDownloaderOfflineKind pins the kind the Anatomy artboard
// labels that example block with, on both run paths.
func TestJDOfflineNotificationCarriesTheJDownloaderOfflineKind(t *testing.T) {
	t.Parallel()

	fanOutDeps, _ := jdOfflineScenario(t)
	fanOutNotifier := &svcFakeNotifier{}
	fanOutDeps.Notifier = fanOutNotifier
	if _, err := NewService(fanOutDeps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := kindOf(t, fanOutNotifier, "MyJDownloader offline"); got != "jdownloader_offline" {
		t.Fatalf("fan-out jd_offline kind = %q, want %q", got, "jdownloader_offline")
	}

	soloDeps, _ := jdOfflineScenario(t)
	soloNotifier := &svcFakeNotifier{}
	soloDeps.Notifier = soloNotifier
	anime := soloDeps.Animes.(*svcFakeAnimeQuery).animes[0]
	if _, err := NewService(soloDeps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}
	if got := kindOf(t, soloNotifier, "MyJDownloader offline"); got != "jdownloader_offline" {
		t.Fatalf("single-anime jd_offline kind = %q, want %q", got, "jdownloader_offline")
	}
}

// TestCleanRunNotificationCarriesTheRunCompletedKind separates the clean terminal case from the
// stopped-early one: they are different kinds in the canvas, and a producer collapsing both onto
// one string would make the metadata footer useless for telling them apart.
func TestCleanRunNotificationCarriesTheRunCompletedKind(t *testing.T) {
	t.Parallel()

	deps := cleanRunScenarioWithNotifier(t)
	notifier := deps.Notifier.(*svcFakeNotifier)

	if _, err := NewService(deps).RunOnce(context.Background(), "manual"); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if got := kindOf(t, notifier, "Download run completed"); got != "run_completed" {
		t.Fatalf("clean-run kind = %q, want %q", got, "run_completed")
	}
}

// cleanRunScenarioWithNotifier wires a single anime with one downloadable episode and nothing
// that fails, so RunOnce settles on "ok" with episodes downloaded.
func cleanRunScenarioWithNotifier(t *testing.T) ServiceDeps {
	t.Helper()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/ok-anime/": {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/ok-anime/5/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/ok-anime/5/": {{URL: "http://mediafire.example/5", Hoster: "Mediafire"}},
		},
	})
	deps.Sites = registry

	okFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-ok",
		Name:      "OK Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/ok-anime/"),
		Folder:    ptrStr(okFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{okFolder: 4}, recursive: map[string]int{okFolder: 5}})
	deps.Notifier = &svcFakeNotifier{}
	return deps
}

// TestSingleAnimeRunNotificationsCarryTheirKind covers the RunAnime status ladder, which is a
// second, independent switch from RunOnce's -- the fan-out test above proves nothing about it.
func TestSingleAnimeRunNotificationsCarryTheirKind(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	folder := t.TempDir()
	registry := NewStaticRegistry()
	registry.Register(&svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/flaky/": {LatestEpisode: 2, EpisodePageURL: "https://jkanime.net/flaky/2/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/flaky/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
		},
		extractErr: map[string]error{
			"https://jkanime.net/flaky/2/": errors.New("boom: episode 2 links unavailable"),
		},
	})
	deps.Sites = registry
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 0}, recursive: map[string]int{folder: 1}})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	anime := contracts.MobileAnime{ID: "flaky", Name: "Flaky Anime", SourceURL: ptrStr("https://jkanime.net/flaky/"), Folder: ptrStr(folder)}

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}

	if got := kindOf(t, notifier, "Anime download started"); got != "run_started" {
		t.Fatalf("single-anime start kind = %q, want %q", got, "run_started")
	}
	if got := kindOf(t, notifier, "Download run completed with errors"); got != "download.run_stopped_early" {
		t.Fatalf("single-anime partial kind = %q, want %q", got, "download.run_stopped_early")
	}
}

// TestCleanSingleAnimeRunCarriesTheRunCompletedKind separates the clean terminal case on the
// RunAnime ladder too: reporting it as stopped-early would make the two indistinguishable.
func TestCleanSingleAnimeRunCarriesTheRunCompletedKind(t *testing.T) {
	t.Parallel()

	deps := cleanRunScenarioWithNotifier(t)
	notifier := deps.Notifier.(*svcFakeNotifier)
	anime := deps.Animes.(*svcFakeAnimeQuery).animes[0]

	if _, err := NewService(deps).RunAnime(context.Background(), "manual_anime", anime); err != nil {
		t.Fatalf("RunAnime: %v", err)
	}

	if got := kindOf(t, notifier, "Download run completed"); got != "run_completed" {
		t.Fatalf("single-anime clean kind = %q, want %q", got, "run_completed")
	}
}

// TestStoppedRunCarriesTheStoppedEarlyKind invokes markCanceled directly, the way AGENTS.md
// prescribes for a branch a scheduled fixture cannot reach reliably: a race between cancellation
// and the pipeline decides whether an end-to-end run ever lands here, so a stress loop could
// pass while never executing the line. Stopping by request IS the run ending before it finished
// everything, which is the outcome family the canvas draws one kind for.
func TestStoppedRunCarriesTheStoppedEarlyKind(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	run := Run{RunID: "run-1", EpisodesDownloaded: 3}
	if !NewService(deps).markCanceled(ctx, "run-1", &run) {
		t.Fatal("markCanceled reported no cancellation for an already-cancelled context")
	}

	if got := kindOf(t, notifier, "Download run stopped"); got != "download.run_stopped_early" {
		t.Fatalf("stopped-run kind = %q, want %q", got, "download.run_stopped_early")
	}
}
