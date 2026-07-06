package main

import (
	"context"
	"fmt"
	"testing"
	"time"

	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// fakeSeasonRepo is an in-memory season.Repository for binding tests.
type fakeSeasonRepo struct {
	seasons     map[string]domain.Season
	order       []string
	createErr   error
	animes      map[string]domain.SeasonAnime
	animesOrder []string
}

func newFakeSeasonRepo() *fakeSeasonRepo {
	return &fakeSeasonRepo{seasons: map[string]domain.Season{}}
}

func (r *fakeSeasonRepo) CreateSeason(_ context.Context, s domain.Season) error {
	if r.createErr != nil {
		return r.createErr
	}
	r.seasons[s.ID] = s
	r.order = append(r.order, s.ID)
	return nil
}

func (r *fakeSeasonRepo) ActiveSeason(_ context.Context) (*domain.Season, error) {
	for _, id := range r.order {
		if s := r.seasons[id]; s.Status == domain.StatusOpen {
			cp := s
			return &cp, nil
		}
	}
	return nil, nil
}

func (r *fakeSeasonRepo) UpdateSeason(_ context.Context, s domain.Season) error {
	r.seasons[s.ID] = s
	return nil
}

func (r *fakeSeasonRepo) CreateSeasonAnime(_ context.Context, sa domain.SeasonAnime) error {
	if r.animes == nil {
		r.animes = map[string]domain.SeasonAnime{}
	}
	r.animes[sa.ID] = sa
	r.animesOrder = append(r.animesOrder, sa.ID)
	return nil
}

func (r *fakeSeasonRepo) ListSeasonAnimes(_ context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	var out []domain.SeasonAnime
	for _, id := range r.animesOrder {
		if sa := r.animes[id]; sa.SeasonID == seasonID {
			out = append(out, sa)
		}
	}
	return out, nil
}

func (r *fakeSeasonRepo) SeasonAnimeByID(_ context.Context, id string) (*domain.SeasonAnime, error) {
	sa, ok := r.animes[id]
	if !ok {
		return nil, nil
	}
	cp := sa
	return &cp, nil
}

func (r *fakeSeasonRepo) UpdateSeasonAnime(_ context.Context, sa domain.SeasonAnime) error {
	r.animes[sa.ID] = sa
	return nil
}

func newTestSeasonApp(repo season.Repository, hub *stubAppRealtimeHub) *App {
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	svc := season.NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return fmt.Sprintf("id-%d", n)
	}, nil)
	app := &App{ctx: context.Background(), seasonService: svc}
	if hub != nil {
		app.realtimeHub = hub
	}
	return app
}

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
