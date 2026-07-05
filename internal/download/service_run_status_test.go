package download

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/events"
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
		ID:      "anime-ok",
		Nombre:  "OK Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/ok-anime/"),
		Carpeta: ptrStr(okFolder),
	}, {
		ID:      "anime-broken",
		Nombre:  "Broken Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/broken-anime/"),
		Carpeta: ptrStr(t.TempDir()),
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
		ID:      "anime-1",
		Nombre:  "Some Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/anime/"),
		Carpeta: ptrStr(jdOfflineFolder),
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

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if len(run.ManualLinks) == 0 {
		t.Fatal("expected manual links to be persisted on the run when JD is offline")
	}
	if run.ManualLinks[0].Anime != "Some Anime" || run.ManualLinks[0].Episode != 3 {
		t.Fatalf("unexpected manual link payload: %#v", run.ManualLinks[0])
	}

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

func TestRunOnceJDOfflineCollectsResolvableManualLinksAfterEpisodeFailure(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	folder := t.TempDir()

	registry := NewStaticRegistry()
	source := &svcFakeEpisodeSource{
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/catchup/": {LatestEpisode: 12, EpisodePageURL: "https://jkanime.net/catchup/12/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/catchup/11/": {{URL: "http://mediafire.example/11", Hoster: "Mediafire"}},
			"https://jkanime.net/catchup/12/": {{URL: "http://mediafire.example/12", Hoster: "Mediafire"}},
		},
		extractErr: map[string]error{
			"https://jkanime.net/catchup/10/": errors.New("episode 10 links unavailable"),
		},
	}
	registry.Register(source)
	deps.Sites = registry
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-1",
		Nombre:  "Catchup Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/catchup/"),
		Carpeta: ptrStr(folder),
	}}}
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{folder: 9}})
	deps.JD = &svcFakeJDClient{ensureOnlineErr: ErrJDOffline}

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected RunOnce to degrade gracefully on jd offline, got err %v", err)
	}
	if result.Status != RunStatusJDOffline {
		t.Fatalf("expected run status %q, got %q", RunStatusJDOffline, result.Status)
	}

	run, ok := deps.Store.(*svcFakeDownloadStore).getRun(result.RunID)
	if !ok {
		t.Fatalf("expected run %q persisted", result.RunID)
	}
	if run.EpisodesFound != 3 || run.EpisodesFailed != 1 {
		t.Fatalf("expected 3 found and 1 failed for the unresolved episode, got %#v", run)
	}
	if len(run.ManualLinks) != 2 {
		t.Fatalf("expected manual links for the two resolvable episodes, got %#v", run.ManualLinks)
	}
	if run.ManualLinks[0].Episode != 11 || run.ManualLinks[1].Episode != 12 {
		t.Fatalf("expected manual links for episodes 11 and 12, got %#v", run.ManualLinks)
	}
}

func TestRunOnceReturnsNoAnimesTodayWhenNoneActiveToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	otherDia := todayDiaName(deps.Clock().AddDate(0, 0, 1))
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:      "anime-1",
		Nombre:  "Not Today Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: otherDia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/anime/"),
		Carpeta: ptrStr(t.TempDir()),
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
		ID:      "anime-inactive",
		Nombre:  "Inactive Today Anime",
		Activo:  0,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/inactive-anime/"),
		Carpeta: ptrStr(t.TempDir()),
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

func TestRunOnceMarksScheduledLastRunBeforeFinishedEvent(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	store := deps.Store.(*svcFakeDownloadStore)
	store.scheduleCfg.NextRunAtMs = 1_800_000_000_000
	deps.Animes = &svcFakeAnimeQuery{}

	finishedSeen := make(chan ScheduleConfig, 1)
	deps.Bus.Subscribe(events.EventNameDownloadRunFinished, func(events.Event) {
		cfg, _ := store.GetScheduleConfig(context.Background())
		finishedSeen <- cfg
	})

	result, err := NewService(deps).RunOnce(context.Background(), "scheduled")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected run status %q, got %q", RunStatusNoAnimesToday, result.Status)
	}

	select {
	case cfg := <-finishedSeen:
		if cfg.LastRunAtMs != deps.Clock().UnixMilli() || cfg.LastRunStatus != RunStatusNoAnimesToday {
			t.Fatalf("schedule config at finished event = %#v, want last run marked with status %q", cfg, RunStatusNoAnimesToday)
		}
		if cfg.NextRunAtMs != 1_800_000_000_000 {
			t.Fatalf("next run changed to %d, want preserved value", cfg.NextRunAtMs)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for download.run_finished event")
	}
}

func TestRunOnceHappyPathDownloadsAndMarksRunOk(t *testing.T) {
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
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
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
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
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
	setSvcFakeCounter(&deps, &svcFakeCounter{atRoot: map[string]int{destFolder: 0}, recursive: map[string]int{destFolder: 1}})

	bus := events.NewBus()
	progressEvents := 0
	bus.Subscribe(events.EventNameDownloadRunProgress, func(event events.Event) { progressEvents++ })
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
		name: "jkanime",
		listEpisodes: map[string]sites.EpisodeListing{
			"https://jkanime.net/anime/": {LatestEpisode: 1, EpisodePageURL: "https://jkanime.net/anime/1/"},
		},
		extractLinks: map[string][]sites.DownloadLink{
			"https://jkanime.net/anime/1/": {{URL: "http://mediafire.example/1", Hoster: "Mediafire"}},
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
