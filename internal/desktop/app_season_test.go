package desktop

import (
	"context"
	"fmt"
	"slices"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	animeDomain "autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/season"
	seasonDomain "autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// ── wired round-trip ────────────────────────────────────────────────────────

func TestCreateSeasonRoundTrip(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)

	if got := app.CreateSeason("Julio 2026"); got != nil {
		t.Fatalf("CreateSeason: expected ok, got %q", got)
	}

	dto := must(t).value(app.GetSeason())
	if dto == nil {
		t.Fatal("expected an active season after create")
	}
	if dto.Name != "Julio 2026" || dto.Status != "open" || dto.Slots != 12 || dto.MinApprovalGrade != 4 {
		t.Fatalf("unexpected DTO: %+v", dto)
	}
	if dto.ClosedAt != nil || dto.AppliedAt != nil {
		t.Fatalf("milestones must be null: %+v", dto)
	}
}

func TestCreateSeasonRejectsSecondOpen(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.CreateSeason("Julio 2026"); got != nil {
		t.Fatalf("first create: %q", got)
	}
	if got := app.CreateSeason("Octubre 2026"); got == nil {
		t.Fatalf("expected error string on second open season, got %q", got)
	}
}

func TestSetSeasonParametersRoundTrip(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.SetSeasonMinApprovalGrade(5); got != nil {
		t.Fatalf("SetSeasonMinApprovalGrade: %q", got)
	}
	if got := app.SetSeasonSlots(9); got != nil {
		t.Fatalf("SetSeasonSlots: %q", got)
	}
	dto := must(t).value(app.GetSeason())
	if dto.MinApprovalGrade != 5 || dto.Slots != 9 {
		t.Fatalf("params not persisted: %+v", dto)
	}

	if got := app.SetSeasonMinApprovalGrade(9); got == nil {
		t.Fatalf("expected rejection of out-of-range grade, got %q", got)
	}
}

func TestImportSeasonIntakeAndGetSeasonAnimes(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ImportSeasonIntake("Dr. Stone\nMARRIAGETOXIN\ndr. stone"); got != nil {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}
	rows := must(t).value(app.GetSeasonAnimes())
	if len(rows) != 2 {
		t.Fatalf("expected 2 deduped rows, got %d: %+v", len(rows), rows)
	}
	for _, r := range rows {
		if r.MatchStatus != "pending" {
			t.Fatalf("expected pending, got %q", r.MatchStatus)
		}
	}
}

func TestImportSeasonIntakeWithoutActiveSeason(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.ImportSeasonIntake("Dr. Stone"); got == nil {
		t.Fatalf("expected error without an active season, got %q", got)
	}
}

func TestRunSeasonMatchingRefreshesAvailabilityForNewMatches(t *testing.T) {
	t.Parallel()
	repo := newFakeSeasonRepo()
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	svc := season.NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return fmt.Sprintf("id-%d", n)
	}, fakeAppNameSearcher{byQuery: map[string][]match.Candidate{
		"Anime With Episode": {
			{Title: "Anime With Episode", PageURL: "https://jkanime.net/anime-with-episode/"},
		},
	}})
	svc.SetAvailabilityDeps(fakeAppAvailabilityProbe{episodes: map[string]int{
		"https://jkanime.net/anime-with-episode/": 1,
	}}, nil)
	app := seasonReady(&App{ctx: context.Background(), seasonService: svc})

	if got := app.CreateSeason("Julio 2026"); got != nil {
		t.Fatalf("CreateSeason: %q", got)
	}
	if got := app.ImportSeasonIntake("Anime With Episode"); got != nil {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}

	if got := app.RunSeasonMatching(); got != nil {
		t.Fatalf("RunSeasonMatching: %q", got)
	}

	rows := must(t).value(app.GetSeasonAnimes())
	if len(rows) != 1 {
		t.Fatalf("expected one row, got %+v", rows)
	}
	if rows[0].MatchStatus != "matched" || rows[0].Availability != "available" || rows[0].AvailableEpisodes != 1 {
		t.Fatalf("matching must immediately expose creatable rows, got %+v", rows[0])
	}
}

// TestRunSeasonMatchingOrdersFinishedAfterBothPhases pins the S5 run order on
// one chronological tape: started once, every name-matching progress, then the
// availability check progress, then exactly one terminal signal. Emitting
// finished before the availability phase completes, or twice, fails here.
func TestRunSeasonMatchingOrdersFinishedAfterBothPhases(t *testing.T) {
	t.Parallel()

	bus := events.NewBus()
	var order []string
	bus.Subscribe(events.EventNameSeasonMatchingStarted, func(e events.Event) {
		if s, ok := e.(events.SeasonMatchingStartedEvent); ok {
			order = append(order, fmt.Sprintf("started:%d", s.Total))
		}
	})
	bus.Subscribe(events.EventNameSeasonMatchingProgress, func(e events.Event) {
		if p, ok := e.(events.SeasonMatchingProgressEvent); ok {
			order = append(order, "progress:"+p.Phase)
		}
	})
	bus.Subscribe(events.EventNameSeasonMatchingFinished, func(e events.Event) {
		if _, ok := e.(events.SeasonMatchingFinishedEvent); ok {
			order = append(order, "finished")
		}
	})

	repo := newFakeSeasonRepo()
	nextID := 0
	svc := season.NewService(repo, time.Now, func() string {
		nextID++
		return fmt.Sprintf("id-%d", nextID)
	}, fakeAppNameSearcher{byQuery: map[string][]match.Candidate{
		"Good Anime": {{Title: "Good Anime", PageURL: "https://jkanime.net/good-anime/"}},
	}})
	svc.SetAvailabilityDeps(
		fakeAppAvailabilityProbe{episodes: map[string]int{"https://jkanime.net/good-anime/": 2}},
		nil,
	)
	svc.SetEventBus(bus)
	app := seasonReady(&App{ctx: context.Background(), seasonService: svc, eventBus: bus})

	if got := app.CreateSeason("Julio 2026"); got != nil {
		t.Fatalf("CreateSeason: %q", got)
	}
	if got := app.ImportSeasonIntake("Good Anime\nTypo Anime"); got != nil {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}
	if got := app.RunSeasonMatching(); got != nil {
		t.Fatalf("RunSeasonMatching: %q", got)
	}

	// The service owns started and the per-row progress: Good Anime matches and is then probed,
	// Typo Anime finds no candidate. The desktop owns finished, exactly once, after both phases.
	want := []string{
		"started:2",
		"progress:" + events.SeasonMatchingPhaseMatching,
		"progress:" + events.SeasonMatchingPhaseMatching,
		"progress:" + events.SeasonMatchingPhaseAvailabilityCheck,
		"finished",
	}
	if !slices.Equal(order, want) {
		t.Fatalf("run order = %q, want %q", order, want)
	}
}

func TestResolveDiscardAndRestoreSeasonRows(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")
	_ = app.ImportSeasonIntake("Anime Uno\nAnime Dos")
	rows := must(t).value(app.GetSeasonAnimes())
	if len(rows) != 2 {
		t.Fatalf("setup expected 2 rows, got %d", len(rows))
	}

	if got := app.ResolveSeasonMatch(rows[0].ID, "https://jkanime.net/anime-uno/"); got != nil {
		t.Fatalf("ResolveSeasonMatch: %q", got)
	}
	if got := app.DiscardSeasonName(rows[1].ID); got != nil {
		t.Fatalf("DiscardSeasonName: %q", got)
	}

	after := seasonRowsByID(t, app)
	if after[rows[0].ID].MatchStatus != "matched" || after[rows[1].ID].MatchStatus != "discarded" {
		t.Fatalf("unexpected rows: %+v", after)
	}

	if got := app.DiscardSeasonName(rows[0].ID); got != nil {
		t.Fatalf("DiscardSeasonName(matched): %q", got)
	}
	if got := app.RestoreSeasonName(rows[0].ID); got != nil {
		t.Fatalf("RestoreSeasonName: %q", got)
	}
	if got := app.RestoreSeasonName("missing"); got == nil {
		t.Fatalf("RestoreSeasonName(missing) = %q, want an error", got)
	}
	restored, ok := seasonRowsByID(t, app)[rows[0].ID]
	if !ok || restored.MatchStatus != "matched" || restored.MatchedSlug != "https://jkanime.net/anime-uno/" {
		t.Fatalf("restored row = %+v (found %v), want matched with its page", restored, ok)
	}
}

func TestReconcileSeasonIntakeAddsAndDiscards(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ReconcileSeasonIntake("Anime A\nAnime B\nAnime C"); got != nil {
		t.Fatalf("ReconcileSeasonIntake: %q", got)
	}
	if len(must(t).value(app.GetSeasonAnimes())) != 3 {
		t.Fatalf("expected 3 rows after reconcile")
	}

	if got := app.ReconcileSeasonIntake("Anime A"); got != nil {
		t.Fatalf("second reconcile: %q", got)
	}
	active := must(t).value(app.GetSeasonAnimes())
	pending := 0
	for _, r := range active {
		if r.MatchStatus == "pending" {
			pending++
		}
	}
	if pending != 1 {
		t.Fatalf("expected 1 pending row after narrowing, got %d (%+v)", pending, active)
	}
}

func TestSendSeasonAnimesToVerHoy(t *testing.T) {
	t.Parallel()
	episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
	app := episodesApp(episode, lifecycle.StateReady)

	got, err := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if err != nil {
		t.Fatalf("SendSeasonAnimesToVerHoy: %v", err)
	}
	if episode.lastDays.AnimeID != "anime-1" || len(episode.lastDays.Dias) != 1 || episode.lastDays.Dias[0] != "Ver hoy" {
		t.Fatalf("expected a Ver hoy move for anime-1, got %+v", episode.lastDays)
	}
	// No download store configured -> the window is treated as passed (offer manual).
	if !got.PastDownloadTime {
		t.Fatalf("expected PastDownloadTime=true without a download schedule, got %+v", got)
	}
}

func TestSendSeasonAnimesToVerHoyBeforeWindowIsAutomatic(t *testing.T) {
	t.Parallel()
	episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	future := fixedNow.Add(2 * time.Hour).Format("15:04")
	store := &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: future, EnabledWeekdays: allWeekdaysMask}}
	sched := &fakeAppScheduler{}
	app := episodesApp(episode, lifecycle.StateReady)
	app.downloadStore, app.downloadScheduler, app.nowTime = store, sched, func() time.Time { return fixedNow }

	got, err := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if err != nil || got.PastDownloadTime {
		t.Fatalf("before the window the send is automatic (no manual prompt), got %+v", got)
	}
	if got.DownloadTime != future {
		t.Fatalf("expected DownloadTime %q, got %q", future, got.DownloadTime)
	}
	if sched.triggerNowCalls != 0 {
		t.Fatalf("send must not force a download run; the schedule handles it, got %d triggers", sched.triggerNowCalls)
	}
}

// TestSendSeasonAnimesToVerHoyPastWindowOffersManual flags a manual download whenever no scheduled
// run will catch the batch today: the time has passed, or today is not one of the selected days.
func TestSendSeasonAnimesToVerHoyPastWindowOffersManual(t *testing.T) {
	t.Parallel()
	// A Wednesday at 10:00.
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	past := fixedNow.Add(-2 * time.Hour).Format("15:04")
	future := fixedNow.Add(2 * time.Hour).Format("15:04")
	tests := []struct {
		name     string
		schedule download.ScheduleConfig
	}{
		{"past today's time", download.ScheduleConfig{Enabled: true, DailyTimeHHMM: past, EnabledWeekdays: allWeekdaysMask}},
		{"today not selected", download.ScheduleConfig{Enabled: true, DailyTimeHHMM: future, EnabledWeekdays: allWeekdaysMask &^ (1 << time.Wednesday)}},
		{"no day selected", download.ScheduleConfig{Enabled: true, DailyTimeHHMM: future}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			episode := &appliedDaysEpisodeService{stubAppEpisodeService: &stubAppEpisodeService{}}
			store := &fakeAppDownloadStore{scheduleConfig: tc.schedule}
			app := episodesApp(episode, lifecycle.StateReady)
			app.downloadStore, app.nowTime = store, func() time.Time { return fixedNow }

			got, err := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
			if err != nil || !got.PastDownloadTime || got.DownloadTime != tc.schedule.DailyTimeHHMM {
				t.Fatalf("expected a manual-download flag with time %q, got %+v", tc.schedule.DailyTimeHHMM, got)
			}
		})
	}
}

func TestTriggerSeasonDownloads(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{}
	app := downloadsReady(&App{downloadScheduler: sched})
	if err := app.TriggerSeasonDownloads(); err != nil {
		t.Fatalf("TriggerSeasonDownloads: %v", err)
	}
	if sched.triggerNowCalls != 1 {
		t.Fatalf("expected one manual download trigger, got %d", sched.triggerNowCalls)
	}
}

func TestSeasonAnimeDTOsOverlaysFolderAndPageForCreatedRowsOnly(t *testing.T) {
	t.Parallel()
	folder := "D:/downloads/frieren"
	page := "https://jkanime.net/frieren/"
	app := &App{ctx: context.Background(), animeQuery: &stubAnimeReadQuery{records: []anime.ReadRecord{
		{Value: animeDomain.Anime{ID: "anime-1", Days: []animeDomain.AnimeDay{{Day: "Sin ver", Order: 1}}, Folder: &folder, SourceURL: &page}},
	}}}
	rows := []seasonDomain.SeasonAnime{
		{ID: "row-created", RawName: "Frieren", AnimeID: "anime-1"},
		{ID: "row-pending", RawName: "Pending Anime", AnimeID: ""},
	}

	dtos := seasonAnimeDTOs(context.Background(), app.animeQuery, rows)
	if len(dtos) != 2 {
		t.Fatalf("expected 2 DTOs, got %d", len(dtos))
	}
	created, pending := dtos[0], dtos[1]
	if created.FolderPath != folder || created.PageURL != page || created.Section != "Sin ver" {
		t.Fatalf("created row = %+v, want folderPath=%q pageUrl=%q section=Sin ver", created, folder, page)
	}
	if pending.FolderPath != "" || pending.PageURL != "" || pending.Section != "" {
		t.Fatalf("uncreated row must have empty folder/page/section, got %+v", pending)
	}
}

func TestCloseSeasonClearsActive(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)
	_ = app.CreateSeason("Julio 2026")

	if got := app.CloseSeason(); got != nil {
		t.Fatalf("CloseSeason: %q", got)
	}
	if must(t).value(app.GetSeason()) != nil {
		t.Fatal("expected no active season after close")
	}
}
