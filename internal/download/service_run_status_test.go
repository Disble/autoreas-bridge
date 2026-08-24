package download

import (
	"context"
	"errors"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/notification"
)

func TestRunOnceIsolatesPerAnimeFailureAndMarksRunPartial(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

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

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected RunOnce to return nil error even on per-anime failure, got %v", err)
	}
	if result.Status != RunStatusPartial {
		t.Fatalf("expected run status %q, got %q", RunStatusPartial, result.Status)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q to be persisted", result.RunID)
	}
	if run.Status != RunStatusPartial {
		t.Fatalf("expected persisted run status %q, got %q", RunStatusPartial, run.Status)
	}
	if run.FinishedAtMs == nil {
		t.Fatal("expected FinalizeRun to set FinishedAtMs (terminal row)")
	}
}

// The run_partial notification used to say only "Some animes failed to download -- see run
// details", which could not tell the user which anime that was without opening the run. Every
// failed anime must now be individually named as its own row, so must every anime that actually
// downloaded episodes, and every uneventful anime (checked, nothing new) must collapse into ONE
// trailing summary row instead of each claiming a row (notification-center spec, "Uneventful
// rows collapse into a single summary line").
func TestRunOnceRunPartialNotificationNamesFailedAnimeAndCollapsesTheRest(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/ok-one/":      {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/ok-one/5/"},
			"https://jkanime.net/ok-two/":      {LatestEpisode: 5, EpisodePageURL: "https://jkanime.net/ok-two/5/"},
			"https://jkanime.net/current-one/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/current-one/3/"},
			"https://jkanime.net/current-two/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/current-two/3/"},
		},
		listErr: map[string]error{
			"https://jkanime.net/broken/": errors.New("boom: site scrape failed"),
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/ok-one/5/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
			"https://jkanime.net/ok-two/5/": {{URL: "http://mediafire.example/2", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry

	okOneFolder, okTwoFolder := t.TempDir(), t.TempDir()
	currentOneFolder, currentTwoFolder := t.TempDir(), t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "anime-ok-1", Name: "OK Anime One", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/ok-one/"), Folder: ptrStr(okOneFolder)},
		{ID: "anime-ok-2", Name: "OK Anime Two", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/ok-two/"), Folder: ptrStr(okTwoFolder)},
		{ID: "anime-broken", Name: "Broken Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/broken/"), Folder: ptrStr(t.TempDir())},
		{ID: "anime-current-1", Name: "Current Anime One", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/current-one/"), Folder: ptrStr(currentOneFolder)},
		{ID: "anime-current-2", Name: "Current Anime Two", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/current-two/"), Folder: ptrStr(currentTwoFolder)},
	}}
	setSvcFakeCounter(&deps, &svcFakeCounter{
		atRoot:    map[string]int{okOneFolder: 4, okTwoFolder: 4, currentOneFolder: 3, currentTwoFolder: 3},
		recursive: map[string]int{okOneFolder: 5, okTwoFolder: 5, currentOneFolder: 3, currentTwoFolder: 3},
	})
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if result.Status != RunStatusPartial {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusPartial)
	}

	got := findNotificationByTitle(notifier, "Download run completed with errors")
	if got == nil {
		t.Fatal("no run-partial notification found")
	}
	if strings.Contains(got.Body, "see run details") {
		t.Fatalf("body = %q, still relies on the literal fallback wording", got.Body)
	}
	if len(got.Rows) != 4 {
		t.Fatalf("rows = %#v, want exactly 4 (1 failed + 2 downloaded + 1 collapsed summary) -- an off-by-one here must fail this test", got.Rows)
	}

	var failedRow, collapsedRow *notification.DetailItem
	downloadedRows := 0
	for i := range got.Rows {
		switch {
		case got.Rows[i].CollapsedCount > 0:
			collapsedRow = &got.Rows[i]
		case got.Rows[i].Status == "downloaded":
			downloadedRows++
		default:
			failedRow = &got.Rows[i]
		}
	}
	if failedRow == nil || failedRow.RefID != "anime-broken" || failedRow.Name != "Broken Anime" || failedRow.Status != "failed" {
		t.Fatalf("failed row = %#v, want it to name Broken Anime", failedRow)
	}
	if downloadedRows != 2 {
		t.Fatalf("rows = %#v, want both anime that downloaded episode 5 named individually", got.Rows)
	}
	if collapsedRow == nil || collapsedRow.CollapsedCount != 2 {
		t.Fatalf("collapsed row = %#v, want CollapsedCount == 2", collapsedRow)
	}
}

// When every anime fails, the run_failed notification must name each one individually too --
// with nothing uneventful to fold, no collapsed row is expected.
func TestRunOnceRunFailedNotificationNamesEveryFailedAnime(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listErr: map[string]error{
			"https://jkanime.net/broken-one/": errors.New("boom: site scrape failed"),
			"https://jkanime.net/broken-two/": errors.New("boom: site scrape failed"),
		},
	}
	registry.Register(source)
	deps.Sites = registry

	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "anime-broken-1", Name: "Broken Anime One", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/broken-one/"), Folder: ptrStr(t.TempDir())},
		{ID: "anime-broken-2", Name: "Broken Anime Two", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/broken-two/"), Folder: ptrStr(t.TempDir())},
	}}
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if result.Status != RunStatusError {
		t.Fatalf("status = %q, want %q", result.Status, RunStatusError)
	}

	got := findNotificationByTitle(notifier, "Download run failed")
	if got == nil {
		t.Fatal("no run-failed notification found")
	}
	if strings.Contains(got.Body, "see run details") {
		t.Fatalf("body = %q, still relies on the literal fallback wording", got.Body)
	}
	if len(got.Rows) != 2 {
		t.Fatalf("rows = %#v, want exactly 2 (one per failed anime, nothing to collapse)", got.Rows)
	}
	byRefID := map[string]notification.DetailItem{}
	for _, row := range got.Rows {
		byRefID[row.RefID] = row
	}
	if byRefID["anime-broken-1"].Name != "Broken Anime One" || byRefID["anime-broken-1"].Status != "failed" {
		t.Fatalf("row for anime-broken-1 = %#v, want it to name Broken Anime One", byRefID["anime-broken-1"])
	}
	if byRefID["anime-broken-2"].Name != "Broken Anime Two" || byRefID["anime-broken-2"].Status != "failed" {
		t.Fatalf("row for anime-broken-2 = %#v, want it to name Broken Anime Two", byRefID["anime-broken-2"])
	}
}

// findNotificationByTitle returns the first captured notification with the given title, or nil
// if none matches.
func findNotificationByTitle(notifier *svcFakeNotifier, title string) *notification.Notification {
	notifications := notifier.notifications()
	for i := range notifications {
		if notifications[i].Title == title {
			return &notifications[i]
		}
	}
	return nil
}

func TestRunOnceDegradesToJDOfflineAndPersistsManualLinks(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/anime/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry
	jdOfflineFolder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "Some Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/anime/"),
		Folder:    ptrStr(jdOfflineFolder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{jdOfflineFolder: 2}})
	deps.JD = &svcFakeJDClient{ensureOnlineErr: ErrJDOffline}
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	svc := NewService(deps)
	result, err := svc.RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected RunOnce to degrade gracefully on jd offline, got err %v", err)
	}
	if result.Status != RunStatusJDOffline {
		t.Fatalf("expected run status %q, got %q", RunStatusJDOffline, result.Status)
	}

	assertJDOfflineManualLink(t, deps, result.RunID)

	found := false
	for _, n := range notifier.notifications() {
		if n.Level == notification.LevelWarning || n.Level == notification.LevelError {
			found = true
		}
	}
	if !found {
		t.Fatal("expected Notifier.Notify to be called on jd_offline degradation")
	}
}

// The jd_offline notification used to say only "N episode(s) need manual download -- see run
// details", which could not tell the user which anime that was without opening the run. Each
// ManualLink already carries its own anime name, so the body must use it directly.
func TestRunOnceJDOfflineNotificationNamesTheAffectedAnime(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	now := deps.Clock()
	dia := todayDiaName(now)

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 3, EpisodePageURL: "https://jkanime.net/anime/3/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/3/": {{URL: "http://mediafire.example/3", Hoster: "Mediafire"}},
		},
	}
	registry.Register(source)
	deps.Sites = registry
	folder := t.TempDir()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "Frieren",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/anime/"),
		Folder:    ptrStr(folder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 2}})
	deps.JD = &svcFakeJDClient{ensureOnlineErr: ErrJDOffline}
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("RunOnce: %v", err)
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
	if !strings.Contains(body, "Frieren") {
		t.Fatalf("jd_offline body = %q, want it to name the affected anime", body)
	}
	if strings.Contains(body, "see run details") {
		t.Fatalf("jd_offline body = %q, still relies on the literal fallback wording", body)
	}
}

// assertJDOfflineManualLink verifies manual links persisted during JD degradation.
func assertJDOfflineManualLink(t *testing.T, deps ServiceDeps, runID string) {
	t.Helper()
	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(runID)
	if !ok || len(run.ManualLinks) == 0 || run.ManualLinks[0].Anime != "Some Anime" || run.ManualLinks[0].Episode != 3 {
		t.Fatalf("unexpected offline manual link run: %#v", run)
	}
}

func TestRunOnceReturnsNoAnimesTodayWhenNoneActiveToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	otherDia := todayDiaName(deps.Clock().AddDate(0, 0, 1))
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-1",
		Name:      "Not Today Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: otherDia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/anime/"),
		Folder:    ptrStr(t.TempDir()),
	}}}

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected run status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}
}

func TestRunOnceReturnsNoAnimesTodayWhenOnlyInactiveAnimeMatchesToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-inactive",
		Name:      "Inactive Today Anime",
		Active:    0,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/inactive-anime/"),
		Folder:    ptrStr(t.TempDir()),
	}}}

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected run status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}
}

func TestRunOnceNotifiesWhenRunStarts(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	notifier := &svcFakeNotifier{}
	deps.Notifier = notifier
	deps.Animes = &svcFakeAnimeQuery{}

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}

	notifications := notifier.notifications()
	if len(notifications) == 0 {
		t.Fatal("expected a run-start notification")
	}
	got := notifications[0]
	if got.Title != "Download run started" || got.Level != notification.LevelInfo {
		t.Fatalf("unexpected start notification: %#v", got)
	}
	if got.Source != "download" || got.CorrelationID != "run-fixed" {
		t.Fatalf("unexpected start notification metadata: %#v", got)
	}
}

func TestRunOnceLeavesScheduleBookkeepingToTheScheduler(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	store := deps.Store.(*svcFakeDownloadStore)
	store.scheduleCfg.NextRunAtMs = 1_800_000_000_000
	deps.Animes = &svcFakeAnimeQuery{}

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected run status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}

	cfg, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if cfg.LastRunAtMs != 0 || cfg.LastRunStatus != "" {
		t.Fatalf("RunOnce must leave schedule bookkeeping to the scheduler wrapper, got %#v", cfg)
	}
	if cfg.NextRunAtMs != 1_800_000_000_000 {
		t.Fatalf("next run changed to %d, want preserved value", cfg.NextRunAtMs)
	}
}
