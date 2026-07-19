package main

import (
	"context"
	"fmt"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/match"
)

// ── nil service safety ──────────────────────────────────────────────────────

func TestGetSeasonReturnsNilWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if app.GetSeason() != nil {
		t.Fatal("expected nil season when service is nil")
	}
}

func TestSeasonMutatorsReturnErrorStringWhenServiceNil(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	for name, got := range map[string]string{
		"CreateSeason":              app.CreateSeason("Julio 2026"),
		"SetSeasonMinApprovalGrade": app.SetSeasonMinApprovalGrade(4),
		"SetSeasonSlots":            app.SetSeasonSlots(12),
		"CloseSeason":               app.CloseSeason(),
	} {
		if got == "" || got == "ok" {
			t.Fatalf("%s: expected non-ok error string with nil service, got %q", name, got)
		}
	}
}

// ── wired round-trip ────────────────────────────────────────────────────────

func TestCreateSeasonRoundTripAndBroadcast(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 1)}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)

	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: expected ok, got %q", got)
	}

	dto := app.GetSeason()
	if dto == nil {
		t.Fatal("expected an active season after create")
	}
	if dto.Name != "Julio 2026" || dto.Status != "open" || dto.Slots != 12 || dto.MinApprovalGrade != 4 {
		t.Fatalf("unexpected DTO: %+v", dto)
	}
	if dto.ClosedAt != nil || dto.AppliedAt != nil {
		t.Fatalf("milestones must be null: %+v", dto)
	}

	select {
	case status := <-hub.seasonChanges:
		if status != "open" {
			t.Fatalf("expected broadcast status open, got %q", status)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast")
	}
}

func TestCreateSeasonRejectsSecondOpen(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("first create: %q", got)
	}
	if got := app.CreateSeason("Octubre 2026"); got == "ok" || got == "" {
		t.Fatalf("expected error string on second open season, got %q", got)
	}
}

func TestSetSeasonParametersRoundTrip(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.SetSeasonMinApprovalGrade(5); got != "ok" {
		t.Fatalf("SetSeasonMinApprovalGrade: %q", got)
	}
	if got := app.SetSeasonSlots(9); got != "ok" {
		t.Fatalf("SetSeasonSlots: %q", got)
	}
	dto := app.GetSeason()
	if dto.MinApprovalGrade != 5 || dto.Slots != 9 {
		t.Fatalf("params not persisted: %+v", dto)
	}

	if got := app.SetSeasonMinApprovalGrade(9); got == "ok" || got == "" {
		t.Fatalf("expected rejection of out-of-range grade, got %q", got)
	}
}

func TestImportSeasonIntakeAndGetSeasonAnimes(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ImportSeasonIntake("Dr. Stone\nMARRIAGETOXIN\ndr. stone"); got != "ok" {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}
	rows := app.GetSeasonAnimes()
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
	if got := app.ImportSeasonIntake("Dr. Stone"); got == "ok" || got == "" {
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
		"Anime With Chapter": {
			{Title: "Anime With Chapter", PageURL: "https://jkanime.net/anime-with-chapter/"},
		},
	}})
	svc.SetAvailabilityDeps(fakeAppAvailabilityProbe{chapters: map[string]int{
		"https://jkanime.net/anime-with-chapter/": 1,
	}}, nil)
	app := &App{ctx: context.Background(), seasonService: svc}

	if got := app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	if got := app.ImportSeasonIntake("Anime With Chapter"); got != "ok" {
		t.Fatalf("ImportSeasonIntake: %q", got)
	}

	if got := app.RunSeasonMatching(); got != "ok" {
		t.Fatalf("RunSeasonMatching: %q", got)
	}

	rows := app.GetSeasonAnimes()
	if len(rows) != 1 {
		t.Fatalf("expected one row, got %+v", rows)
	}
	if rows[0].MatchStatus != "matched" || rows[0].Availability != "available" || rows[0].AvailableEpisodes != 1 {
		t.Fatalf("matching must immediately expose creatable rows, got %+v", rows[0])
	}
}

func TestResolveAndDiscardSeasonRows(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")
	_ = app.ImportSeasonIntake("Anime Uno\nAnime Dos")
	rows := app.GetSeasonAnimes()
	if len(rows) != 2 {
		t.Fatalf("setup expected 2 rows, got %d", len(rows))
	}

	if got := app.ResolveSeasonMatch(rows[0].ID, "https://jkanime.net/anime-uno/"); got != "ok" {
		t.Fatalf("ResolveSeasonMatch: %q", got)
	}
	if got := app.DiscardSeasonName(rows[1].ID); got != "ok" {
		t.Fatalf("DiscardSeasonName: %q", got)
	}

	after := app.GetSeasonAnimes()
	status := map[string]string{}
	for _, r := range after {
		status[r.ID] = r.MatchStatus
	}
	if status[rows[0].ID] != "matched" || status[rows[1].ID] != "discarded" {
		t.Fatalf("unexpected statuses: %+v", status)
	}
}

func TestReconcileSeasonIntakeAddsAndDiscards(t *testing.T) {
	t.Parallel()
	app := newTestSeasonApp(newFakeSeasonRepo(), nil)
	_ = app.CreateSeason("Julio 2026")

	if got := app.ReconcileSeasonIntake("Anime A\nAnime B\nAnime C"); got != "ok" {
		t.Fatalf("ReconcileSeasonIntake: %q", got)
	}
	if len(app.GetSeasonAnimes()) != 3 {
		t.Fatalf("expected 3 rows after reconcile")
	}

	if got := app.ReconcileSeasonIntake("Anime A"); got != "ok" {
		t.Fatalf("second reconcile: %q", got)
	}
	active := app.GetSeasonAnimes()
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
	chapter := &appliedDaysChapterService{stubAppChapterService: &stubAppChapterService{}}
	app := &App{ctx: context.Background(), episodeService: chapter}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" {
		t.Fatalf("SendSeasonAnimesToVerHoy: %q", got.Status)
	}
	if chapter.lastDays.AnimeID != "anime-1" || len(chapter.lastDays.Dias) != 1 || chapter.lastDays.Dias[0] != "Ver hoy" {
		t.Fatalf("expected a Ver hoy move for anime-1, got %+v", chapter.lastDays)
	}
	// No download store configured -> the window is treated as passed (offer manual).
	if !got.PastDownloadTime {
		t.Fatalf("expected PastDownloadTime=true without a download schedule, got %+v", got)
	}
}

func TestSendSeasonAnimesToVerHoyBeforeWindowIsAutomatic(t *testing.T) {
	t.Parallel()
	chapter := &appliedDaysChapterService{stubAppChapterService: &stubAppChapterService{}}
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	future := fixedNow.Add(2 * time.Hour).Format("15:04")
	store := &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: future}}
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), episodeService: chapter, downloadStore: store, downloadScheduler: sched, nowTime: func() time.Time { return fixedNow }}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" || got.PastDownloadTime {
		t.Fatalf("before the window the send is automatic (no manual prompt), got %+v", got)
	}
	if got.DownloadTime != future {
		t.Fatalf("expected DownloadTime %q, got %q", future, got.DownloadTime)
	}
	if sched.triggerNowCalls != 0 {
		t.Fatalf("send must not force a download run; the schedule handles it, got %d triggers", sched.triggerNowCalls)
	}
}

func TestSendSeasonAnimesToVerHoyPastWindowOffersManual(t *testing.T) {
	t.Parallel()
	chapter := &appliedDaysChapterService{stubAppChapterService: &stubAppChapterService{}}
	fixedNow := time.Date(2026, 7, 8, 10, 0, 0, 0, time.Local)
	past := fixedNow.Add(-2 * time.Hour).Format("15:04")
	store := &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{Enabled: true, DailyTimeHHMM: past}}
	app := &App{ctx: context.Background(), episodeService: chapter, downloadStore: store, nowTime: func() time.Time { return fixedNow }}

	got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"})
	if got.Status != "ok" || !got.PastDownloadTime {
		t.Fatalf("past the window the send must flag a manual download, got %+v", got)
	}
}

func TestSendSeasonAnimesToVerHoyNoChapterService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.SendSeasonAnimesToVerHoy([]string{"anime-1"}); got.Status == "ok" || got.Status == "" {
		t.Fatalf("expected error without chapter service, got %q", got.Status)
	}
}

func TestTriggerSeasonDownloads(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{}
	app := &App{ctx: context.Background(), downloadScheduler: sched}
	if got := app.TriggerSeasonDownloads(); got != "ok" {
		t.Fatalf("TriggerSeasonDownloads: %q", got)
	}
	if sched.triggerNowCalls != 1 {
		t.Fatalf("expected one manual download trigger, got %d", sched.triggerNowCalls)
	}
}

func TestGetSeasonAnimesEmptyWhenNoService(t *testing.T) {
	t.Parallel()
	app := &App{ctx: context.Background()}
	if got := app.GetSeasonAnimes(); len(got) != 0 {
		t.Fatalf("expected empty list with nil service, got %+v", got)
	}
}

func TestCloseSeasonClearsActiveAndBroadcastsClosed(t *testing.T) {
	t.Parallel()
	hub := &stubAppRealtimeHub{seasonChanges: make(chan string, 2)}
	app := newTestSeasonApp(newFakeSeasonRepo(), hub)
	_ = app.CreateSeason("Julio 2026")
	<-hub.seasonChanges // drain the create broadcast

	if got := app.CloseSeason(); got != "ok" {
		t.Fatalf("CloseSeason: %q", got)
	}
	if app.GetSeason() != nil {
		t.Fatal("expected no active season after close")
	}
	select {
	case status := <-hub.seasonChanges:
		if status != "closed" {
			t.Fatalf("expected broadcast status closed, got %q", status)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected a season_changed broadcast on close")
	}
}
