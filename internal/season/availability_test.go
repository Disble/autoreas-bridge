package season

import (
	"context"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// fakeProbe reports ch.1 availability per page URL.
type fakeProbe struct {
	available map[string]bool
	err       error
}

func (f *fakeProbe) HasChapterOne(_ context.Context, pageURL string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.available[pageURL], nil
}

// fakeGateway records creates and answers existing-by-pagina lookups.
type fakeGateway struct {
	existingByPagina map[string]string
	created          []AnimeCreateInput
	nextID           int
}

func (g *fakeGateway) CreateAnime(_ context.Context, in AnimeCreateInput) (string, error) {
	g.created = append(g.created, in)
	g.nextID++
	return "created-anime", nil
}

func (g *fakeGateway) FindActiveByPagina(_ context.Context, pageURL string) (string, bool, error) {
	id, ok := g.existingByPagina[pageURL]
	return id, ok, nil
}

func seedMatched(t *testing.T, svc *Service, repo *fakeRepo, seasonID, id, name, slug string) {
	t.Helper()
	sa := domain.NewSeasonAnime(id, seasonID, name, svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = slug
	if err := repo.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func TestRecheckAvailabilityCreatesLinksAndWaits(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{available: map[string]bool{
		"https://jkanime.net/a/": true,  // newly available → create
		"https://jkanime.net/b/": false, // still waiting
		"https://jkanime.net/c/": true,  // available but already active → link
	}}
	gateway := &fakeGateway{existingByPagina: map[string]string{
		"https://jkanime.net/c/": "existing-anime",
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "sa-a", "Anime A", "https://jkanime.net/a/")
	seedMatched(t, svc, repo, season.ID, "sa-b", "Anime B", "https://jkanime.net/b/")
	seedMatched(t, svc, repo, season.ID, "sa-c", "Anime C", "https://jkanime.net/c/")

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byID := map[string]domain.SeasonAnime{}
	for _, r := range rows {
		byID[r.ID] = r
	}

	if a := byID["sa-a"]; a.Availability != domain.AvailabilityCreated || a.AnimeID != "created-anime" {
		t.Fatalf("A should be created + linked to the new anime, got %+v", a)
	}
	if b := byID["sa-b"]; b.Availability != domain.AvailabilityWaiting || b.AnimeID != "" {
		t.Fatalf("B should still be waiting, got %+v", b)
	}
	if c := byID["sa-c"]; c.Availability != domain.AvailabilityCreated || c.AnimeID != "existing-anime" {
		t.Fatalf("C should be linked to the existing active anime, got %+v", c)
	}
	if len(gateway.created) != 1 || gateway.created[0].Section != "Sin ver" {
		t.Fatalf("exactly one create into Sin ver expected, got %+v", gateway.created)
	}

	// Result reports the two newly-available names (A created, C linked).
	if len(res.Created) != 2 {
		t.Fatalf("expected 2 newly-available names, got %v", res.Created)
	}
}

func TestRecheckAvailabilityIsIdempotent(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{available: map[string]bool{"https://jkanime.net/a/": true}}
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "sa-a", "Anime A", "https://jkanime.net/a/")

	if _, err := svc.RecheckAvailability(ctx, season.ID); err != nil {
		t.Fatalf("first recheck: %v", err)
	}
	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("second recheck: %v", err)
	}
	if len(res.Created) != 0 {
		t.Fatalf("second run must be a no-op, got created %v", res.Created)
	}
	if len(gateway.created) != 1 {
		t.Fatalf("anime must be created exactly once across reruns, got %d", len(gateway.created))
	}
}

func TestRecheckAvailabilityRequiresDeps(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.RecheckAvailability(ctx, season.ID); err == nil {
		t.Fatal("RecheckAvailability without probe/gateway deps must error")
	}
}
