package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

func TestServiceCreateSeason(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	s, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if s.Name != "Julio 2026" || s.Status != domain.StatusOpen || s.Slots != 12 || s.MinApprovalGrade != 4 {
		t.Fatalf("unexpected season: %+v", s)
	}

	active, err := svc.ActiveSeason(ctx)
	if err != nil || active == nil || active.ID != s.ID {
		t.Fatalf("ActiveSeason = %+v, err %v", active, err)
	}
}

func TestServiceCreateSeasonRejectsSecondOpen(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("first CreateSeason: %v", err)
	}
	_, err := svc.CreateSeason(ctx, "Octubre 2026")
	if !errors.Is(err, ErrSeasonAlreadyOpen) {
		t.Fatalf("expected ErrSeasonAlreadyOpen, got %v", err)
	}
}

func TestServiceSetParametersAndClose(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	created, _ := svc.CreateSeason(ctx, "Julio 2026")

	if err := svc.SetMinApprovalGrade(ctx, 5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := svc.SetSlots(ctx, 9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.MinApprovalGrade != 5 || active.Slots != 9 {
		t.Fatalf("params not persisted: %+v", active)
	}

	if err := svc.CloseSeason(ctx); err != nil {
		t.Fatalf("CloseSeason: %v", err)
	}
	if after, _ := svc.ActiveSeason(ctx); after != nil {
		t.Fatalf("expected no active season after close, got %+v", after)
	}

	stored := repo.seasons[created.ID]
	if !stored.IsClosed() || stored.ClosedAt == nil {
		t.Fatalf("closed season not persisted: %+v", stored)
	}
}

func TestServiceMutationsRequireActiveSeason(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()

	if err := svc.SetSlots(ctx, 10); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
	if err := svc.CloseSeason(ctx); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
}

func TestServiceSetInvalidParameterRejected(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if err := svc.SetMinApprovalGrade(ctx, 9); err == nil {
		t.Fatal("grade 9 must be rejected")
	}
}

func TestServiceImportIntakeParsesDedupesAndSkipsBlanks(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	count, err := svc.ImportIntake(ctx, season.ID, "  Dr. Stone  \n\nMARRIAGETOXIN\ndr. stone\n   \nAkane-banashi\n")
	if err != nil {
		t.Fatalf("ImportIntake: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 unique names imported, got %d", count)
	}
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
	for _, r := range rows {
		if r.MatchStatus != domain.MatchPending {
			t.Fatalf("imported rows must be pending, got %q", r.MatchStatus)
		}
	}
}

func TestServiceListSeasonsAndSeasonByID(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	// A closed "past" season plus a currently-open one.
	first, _ := svc.CreateSeason(ctx, "Abril 2026")
	if err := svc.CloseSeason(ctx); err != nil {
		t.Fatalf("CloseSeason: %v", err)
	}
	second, _ := svc.CreateSeason(ctx, "Julio 2026")

	all, err := svc.ListSeasons(ctx)
	if err != nil {
		t.Fatalf("ListSeasons: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("expected both seasons listed, got %d", len(all))
	}

	got, err := svc.SeasonByID(ctx, first.ID)
	if err != nil {
		t.Fatalf("SeasonByID: %v", err)
	}
	if got == nil || got.ID != first.ID || !got.IsClosed() {
		t.Fatalf("SeasonByID(%q) = %+v, want the closed first season", first.ID, got)
	}

	open, err := svc.SeasonByID(ctx, second.ID)
	if err != nil {
		t.Fatalf("SeasonByID(open): %v", err)
	}
	if open == nil || open.IsClosed() {
		t.Fatalf("SeasonByID(%q) should be the open season, got %+v", second.ID, open)
	}

	missing, err := svc.SeasonByID(ctx, "does-not-exist")
	if err != nil {
		t.Fatalf("SeasonByID(missing) should not error, got %v", err)
	}
	if missing != nil {
		t.Fatalf("SeasonByID(missing) = %+v, want nil", missing)
	}
}

func TestServiceAddIntakeName(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	// Triangulated: the append path, the blank-skip path, and the case-insensitive
	// dedup path — run in sequence so the duplicate case sees the first append.
	cases := []struct {
		name      string
		input     string
		wantAdded bool
	}{
		{name: "a non-blank name is appended", input: "Naruto", wantAdded: true},
		{name: "a blank name is skipped", input: "   ", wantAdded: false},
		{name: "a case-insensitive duplicate is skipped", input: "naruto", wantAdded: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			added, err := svc.AddIntakeName(ctx, season.ID, tc.input)
			if err != nil {
				t.Fatalf("AddIntakeName(%q): %v", tc.input, err)
			}
			if added != tc.wantAdded {
				t.Fatalf("AddIntakeName(%q) added = %v, want %v", tc.input, added, tc.wantAdded)
			}
		})
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	if len(rows) != 1 {
		t.Fatalf("expected exactly one row after append/skip/dup, got %d", len(rows))
	}
}

func TestServiceReconcileIntakeRevivesDiscarded(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	_ = svc.ReconcileIntake(ctx, season.ID, "Anime A")
	// Remove it → discarded.
	_ = svc.ReconcileIntake(ctx, season.ID, "")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	if rows[0].MatchStatus != domain.MatchDiscarded {
		t.Fatalf("Anime A should be discarded after removal, got %q", rows[0].MatchStatus)
	}

	// Re-add it → the SAME row revives to pending (no duplicate).
	_ = svc.ReconcileIntake(ctx, season.ID, "Anime A")
	rows, _ = svc.ListSeasonAnimes(ctx, season.ID)
	if len(rows) != 1 {
		t.Fatalf("re-adding must revive not duplicate, got %d rows", len(rows))
	}
	if rows[0].MatchStatus != domain.MatchPending {
		t.Fatalf("revived row should be pending, got %q", rows[0].MatchStatus)
	}
}

func TestServiceRunMatchingClassifiesRows(t *testing.T) {
	repo := newFakeRepo()
	searcher := &fakeSearcher{byQuery: map[string][]match.Candidate{
		"Dr. Stone: Science Future Part 3": {
			{Title: "Dr. Stone: Science Future Part 3", PageURL: "https://jkanime.net/dr-stone-science-future-part-3/"},
			{Title: "Dr. Stone: Science Future Part 2", PageURL: "https://jkanime.net/dr-stone-science-future-part-2/"},
		},
		"Sword Art": {
			{Title: "Sword Art Online", PageURL: "https://jkanime.net/sword-art-online/"},
			{Title: "Sword Art Offline", PageURL: "https://jkanime.net/sword-art-offline/"},
		},
		"Anime Inexistente": {},
	}}
	svc := newTestServiceWithSearcher(repo, searcher)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Dr. Stone: Science Future Part 3\nSword Art\nAnime Inexistente")

	if err := svc.RunMatching(ctx, season.ID); err != nil {
		t.Fatalf("RunMatching: %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byName := map[string]domain.SeasonAnime{}
	for _, r := range rows {
		byName[r.RawName] = r
	}

	if got := byName["Dr. Stone: Science Future Part 3"]; got.MatchStatus != domain.MatchMatched || got.MatchedSlug == "" {
		t.Fatalf("Dr. Stone should be matched, got %+v", got)
	}
	if got := byName["Sword Art"]; got.MatchStatus != domain.MatchAmbiguous || len(got.Candidates) < 2 {
		t.Fatalf("Sword Art should be ambiguous with candidates, got %+v", got)
	}
	if got := byName["Anime Inexistente"]; got.MatchStatus != domain.MatchNotFound {
		t.Fatalf("Anime Inexistente should be not_found, got %+v", got)
	}
}

func TestServiceResolveMatchSetsMatchedSlug(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Some Anime")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)

	if err := svc.ResolveMatch(ctx, rows[0].ID, "https://jkanime.net/some-anime/"); err != nil {
		t.Fatalf("ResolveMatch: %v", err)
	}
	got, _ := repo.SeasonAnimeByID(ctx, rows[0].ID)
	if got.MatchStatus != domain.MatchMatched || got.MatchedSlug != "https://jkanime.net/some-anime/" {
		t.Fatalf("resolve did not set matched slug: %+v", got)
	}
}

func TestServiceDiscardName(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	_, _ = svc.ImportIntake(ctx, season.ID, "Some Anime")
	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)

	if err := svc.DiscardName(ctx, rows[0].ID); err != nil {
		t.Fatalf("DiscardName: %v", err)
	}
	got, _ := repo.SeasonAnimeByID(ctx, rows[0].ID)
	if got.MatchStatus != domain.MatchDiscarded {
		t.Fatalf("discard did not set status: %+v", got)
	}
}
