package season

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// fakeProbe reports the count of available chapters per page URL.
type fakeProbe struct {
	chapters map[string]int
	err      error
}

func (f *fakeProbe) AvailableChapters(_ context.Context, pageURL string) (int, error) {
	if f.err != nil {
		return 0, f.err
	}
	return f.chapters[pageURL], nil
}

// fakeGateway records creates and answers existing-by-pagina lookups.
type fakeGateway struct {
	existingByPagina map[string]string
	created          []AnimeCreateInput
	nextID           int
	moved            map[string]string
	selections       map[string]selectionState
	placements       map[string][]domain.Placement
	scheduled        map[string][]domain.Placement
	failSchedule     map[string]bool
}

type selectionState struct {
	estado int
	activo bool
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

func (g *fakeGateway) MoveToSection(_ context.Context, animeID, section string) error {
	if g.moved == nil {
		g.moved = map[string]string{}
	}
	g.moved[animeID] = section
	return nil
}

func (g *fakeGateway) SetSelection(_ context.Context, animeID string, estado int, activo bool) error {
	if g.selections == nil {
		g.selections = map[string]selectionState{}
	}
	g.selections[animeID] = selectionState{estado: estado, activo: activo}
	return nil
}

func (g *fakeGateway) CurrentPlacements(_ context.Context, animeIDs []string) (map[string][]domain.Placement, error) {
	out := map[string][]domain.Placement{}
	for _, id := range animeIDs {
		if p, ok := g.placements[id]; ok {
			out[id] = p
		}
	}
	return out, nil
}

func (g *fakeGateway) SetAnimeSchedule(_ context.Context, animeID string, dias []domain.Placement) error {
	if g.failSchedule[animeID] {
		return errors.New("write failed")
	}
	if g.scheduled == nil {
		g.scheduled = map[string][]domain.Placement{}
	}
	g.scheduled[animeID] = dias
	return nil
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

// RecheckAvailability ONLY reports availability — it NEVER creates an anime.
// Creation is a separate, explicit, consent-gated action (CreateSeasonAnimes).
func TestRecheckAvailabilityMarksAvailableNeverCreates(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{
		"https://jkanime.net/a/": 3, // available (3 chapters)
		"https://jkanime.net/b/": 0, // not available yet
	}}
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedMatched(t, svc, repo, season.ID, "sa-a", "Anime A", "https://jkanime.net/a/")
	seedMatched(t, svc, repo, season.ID, "sa-b", "Anime B", "https://jkanime.net/b/")

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byID := map[string]domain.SeasonAnime{}
	for _, r := range rows {
		byID[r.ID] = r
	}
	if a := byID["sa-a"]; a.Availability != domain.AvailabilityAvailable || a.AvailableChapters != 3 || a.AnimeID != "" {
		t.Fatalf("A should be available with 3 chapters and NOT created, got %+v", a)
	}
	if b := byID["sa-b"]; b.Availability != domain.AvailabilityWaiting || b.AvailableChapters != 0 {
		t.Fatalf("B should still be waiting, got %+v", b)
	}
	if len(gateway.created) != 0 {
		t.Fatalf("recheck must NEVER create an anime, got %+v", gateway.created)
	}
	if len(res.Available) != 1 || res.Available[0] != "Anime A" {
		t.Fatalf("expected 1 newly-available name (Anime A), got %v", res.Available)
	}
}

func TestRecheckAvailabilityReportsOnlyNewTransitions(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/a/": 1}}
	svc.SetAvailabilityDeps(probe, &fakeGateway{})

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
	if len(res.Available) != 0 {
		t.Fatalf("an already-available row must not be re-reported, got %v", res.Available)
	}
}

func seedCreated(t *testing.T, svc *Service, repo *fakeRepo, seasonID, id, name, slug, animeID string, chapters int) {
	t.Helper()
	sa := domain.NewSeasonAnime(id, seasonID, name, svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = slug
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = animeID
	sa.AvailableChapters = chapters
	if err := repo.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func findRow(t *testing.T, svc *Service, seasonID, id string) domain.SeasonAnime {
	t.Helper()
	rows, err := svc.ListSeasonAnimes(context.Background(), seasonID)
	if err != nil {
		t.Fatalf("ListSeasonAnimes: %v", err)
	}
	for _, r := range rows {
		if r.ID == id {
			return r
		}
	}
	t.Fatalf("row %q not found", id)
	return domain.SeasonAnime{}
}

// A created row still parked in "Sin ver" MUST have its AvailableChapters
// refreshed live; Availability, MatchStatus, AnimeID stay untouched and the
// row is never reported in res.Available (ADR-3, ADR-4).
func TestRecheckAvailabilityRefreshesSinVerCreatedRow(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/created/": 5}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-created": {{Dia: sinVerSection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-created", "Anime Created", "https://jkanime.net/created/", "anime-created", 2)

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-created")
	if row.AvailableChapters != 5 {
		t.Fatalf("AvailableChapters = %d, want 5", row.AvailableChapters)
	}
	if row.Availability != domain.AvailabilityCreated {
		t.Fatalf("Availability = %v, want AvailabilityCreated (must never flip)", row.Availability)
	}
	if row.MatchStatus != domain.MatchMatched || row.AnimeID != "anime-created" {
		t.Fatalf("MatchStatus/AnimeID must stay untouched, got %+v", row)
	}
	if res.Checked != 1 {
		t.Fatalf("res.Checked = %d, want 1", res.Checked)
	}
	for _, name := range res.Available {
		if name == "Anime Created" {
			t.Fatal("a Sin-ver created row's refresh must NEVER appear in res.Available")
		}
	}
}

// A created row parked in "Ver hoy" must never be probed.
func TestRecheckAvailabilitySkipsVerHoyCreatedRow(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/verhoy/": 9}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-verhoy": {{Dia: verHoySection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-verhoy", "Anime VerHoy", "https://jkanime.net/verhoy/", "anime-verhoy", 3)

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-verhoy")
	if row.AvailableChapters != 3 {
		t.Fatalf("AvailableChapters must stay frozen at 3, got %d", row.AvailableChapters)
	}
	if res.Checked != 0 {
		t.Fatalf("res.Checked = %d, want 0 (Ver hoy row must not be probed)", res.Checked)
	}
}

// A created row parked in "Visto" must never be probed.
func TestRecheckAvailabilitySkipsVistoCreatedRow(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/visto/": 9}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-visto": {{Dia: vistoSection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-visto", "Anime Visto", "https://jkanime.net/visto/", "anime-visto", 4)

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-visto")
	if row.AvailableChapters != 4 {
		t.Fatalf("AvailableChapters must stay frozen at 4, got %d", row.AvailableChapters)
	}
	if res.Checked != 0 {
		t.Fatalf("res.Checked = %d, want 0 (Visto row must not be probed)", res.Checked)
	}
}

// A created row whose anime id has no entry in CurrentPlacements' result
// (empty/absent placements) must be skipped exactly like an unresolvable row
// is today.
func TestRecheckAvailabilitySkipsCreatedRowWithNoResolvableSection(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/unresolved/": 9}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-unresolved", "Anime Unresolved", "https://jkanime.net/unresolved/", "anime-unresolved", 1)

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-unresolved")
	if row.AvailableChapters != 1 {
		t.Fatalf("AvailableChapters must stay frozen at 1, got %d", row.AvailableChapters)
	}
	if res.Checked != 0 {
		t.Fatalf("res.Checked = %d, want 0 (unresolvable row must not be probed)", res.Checked)
	}
}

// gatewayPlacementsErr is a fakeGateway whose CurrentPlacements always errors,
// to assert the whole run tolerates a batched-lookup failure.
type gatewayPlacementsErr struct {
	fakeGateway
}

func (g *gatewayPlacementsErr) CurrentPlacements(_ context.Context, _ []string) (map[string][]domain.Placement, error) {
	return nil, errors.New("placements lookup failed")
}

// If gateway.CurrentPlacements errors, every created row is left untouched
// this run, but the existing matched-uncreated path still runs and the call
// as a whole does not fail.
func TestRecheckAvailabilityToleratesPlacementsError(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{
		"https://jkanime.net/created/": 9,
		"https://jkanime.net/a/":       3,
	}}
	gateway := &gatewayPlacementsErr{}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-created", "Anime Created", "https://jkanime.net/created/", "anime-created", 2)
	seedMatched(t, svc, repo, season.ID, "sa-a", "Anime A", "https://jkanime.net/a/")

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability must not fail on a placements lookup error: %v", err)
	}

	created := findRow(t, svc, season.ID, "sa-created")
	if created.AvailableChapters != 2 {
		t.Fatalf("created row must stay untouched on placements error, got %d", created.AvailableChapters)
	}

	matched := findRow(t, svc, season.ID, "sa-a")
	if matched.Availability != domain.AvailabilityAvailable || matched.AvailableChapters != 3 {
		t.Fatalf("matched-uncreated row must still be probed despite placements error, got %+v", matched)
	}
	if res.Checked != 1 {
		t.Fatalf("res.Checked = %d, want 1 (only the matched-uncreated row)", res.Checked)
	}
}

// Two consecutive RecheckAvailability calls with a stable probe leave a
// Sin-ver created row identical (idempotency).
func TestRecheckAvailabilitySinVerCreatedRowIsIdempotent(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{chapters: map[string]int{"https://jkanime.net/created/": 5}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-created": {{Dia: sinVerSection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, season.ID, "sa-created", "Anime Created", "https://jkanime.net/created/", "anime-created", 2)

	if _, err := svc.RecheckAvailability(ctx, season.ID); err != nil {
		t.Fatalf("first recheck: %v", err)
	}
	first := findRow(t, svc, season.ID, "sa-created")

	if _, err := svc.RecheckAvailability(ctx, season.ID); err != nil {
		t.Fatalf("second recheck: %v", err)
	}
	second := findRow(t, svc, season.ID, "sa-created")

	if !reflect.DeepEqual(first, second) {
		t.Fatalf("Sin-ver created row must be identical across runs, first=%+v second=%+v", first, second)
	}
	if second.AvailableChapters != 5 {
		t.Fatalf("AvailableChapters = %d, want 5", second.AvailableChapters)
	}
}

func TestRecheckAvailabilityRequiresProbe(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.RecheckAvailability(ctx, season.ID); err == nil {
		t.Fatal("RecheckAvailability without a probe must error")
	}
}

func TestCreateSeasonAnimesCreatesLinksAndGuards(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{existingByPagina: map[string]string{"https://jkanime.net/c/": "existing-anime"}}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	// a: available → create; b: waiting → skipped; c: available + already active → link.
	mkAvail := func(id, name, slug string) {
		sa := domain.NewSeasonAnime(id, season.ID, name, svc.now())
		sa.MatchStatus = domain.MatchMatched
		sa.MatchedSlug = slug
		sa.Availability = domain.AvailabilityAvailable
		sa.AvailableChapters = 2
		_ = repo.CreateSeasonAnime(ctx, sa)
	}
	mkAvail("sa-a", "Anime A", "https://jkanime.net/a/")
	seedMatched(t, svc, repo, season.ID, "sa-b", "Anime B", "https://jkanime.net/b/") // waiting
	mkAvail("sa-c", "Anime C", "https://jkanime.net/c/")

	res, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a", "sa-b", "sa-c"}, "", nil)
	if err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}

	rows, _ := svc.ListSeasonAnimes(ctx, season.ID)
	byID := map[string]domain.SeasonAnime{}
	for _, r := range rows {
		byID[r.ID] = r
	}
	if a := byID["sa-a"]; a.Availability != domain.AvailabilityCreated || a.AnimeID != "created-anime" {
		t.Fatalf("A should be created + linked, got %+v", a)
	}
	if b := byID["sa-b"]; b.Availability != domain.AvailabilityWaiting || b.AnimeID != "" {
		t.Fatalf("B (waiting) must NOT be created, got %+v", b)
	}
	if c := byID["sa-c"]; c.Availability != domain.AvailabilityCreated || c.AnimeID != "existing-anime" {
		t.Fatalf("C should link to the existing active anime, got %+v", c)
	}
	if len(gateway.created) != 1 || gateway.created[0].Section != "Sin ver" {
		t.Fatalf("exactly one create into Sin ver expected, got %+v", gateway.created)
	}
	if len(res.Created) != 2 {
		t.Fatalf("expected 2 created names (A, C), got %v", res.Created)
	}
}

func TestCreateSeasonAnimesDerivesDownloadFolder(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	// sa-c links to an existing anime: its folder must stay untouched (no create).
	gateway := &fakeGateway{existingByPagina: map[string]string{"https://jkanime.net/c/": "existing-anime"}}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	mkAvail := func(id, name, slug string) {
		sa := domain.NewSeasonAnime(id, season.ID, name, svc.now())
		sa.MatchStatus = domain.MatchMatched
		sa.MatchedSlug = slug
		sa.Availability = domain.AvailabilityAvailable
		_ = repo.CreateSeasonAnime(ctx, sa)
	}
	mkAvail("sa-a", "Re:Zero", "https://jkanime.net/a/") // default: root + sanitized name
	mkAvail("sa-b", "Naruto", "https://jkanime.net/b/")  // override wins
	mkAvail("sa-c", "Linked", "https://jkanime.net/c/")  // linked: no create

	root := filepath.Join("D:", "Anime")
	override := filepath.Join("E:", "Custom", "Naruto S2")
	overrides := map[string]string{"sa-b": override}

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a", "sa-b", "sa-c"}, root, overrides); err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}

	folderByPagina := map[string]string{}
	for _, in := range gateway.created {
		folderByPagina[in.Pagina] = in.Carpeta
	}
	if len(gateway.created) != 2 {
		t.Fatalf("expected 2 creates (linked one skipped), got %d: %+v", len(gateway.created), gateway.created)
	}
	if got, want := folderByPagina["https://jkanime.net/a/"], filepath.Join(root, "Re Zero"); got != want {
		t.Fatalf("default derived folder = %q, want %q", got, want)
	}
	if got := folderByPagina["https://jkanime.net/b/"]; got != override {
		t.Fatalf("override folder = %q, want %q", got, override)
	}
}

func TestCreateSeasonAnimesIsIdempotent(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	sa := domain.NewSeasonAnime("sa-a", season.ID, "Anime A", svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = "https://jkanime.net/a/"
	sa.Availability = domain.AvailabilityAvailable
	_ = repo.CreateSeasonAnime(ctx, sa)

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, "", nil); err != nil {
		t.Fatalf("first create: %v", err)
	}
	res, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, "", nil)
	if err != nil {
		t.Fatalf("second create: %v", err)
	}
	if len(res.Created) != 0 || len(gateway.created) != 1 {
		t.Fatalf("an already-created row must not be created again: res=%v created=%d", res.Created, len(gateway.created))
	}
}

func TestCreateSeasonAnimesRequiresGateway(t *testing.T) {
	svc := newTestService(newFakeRepo())
	if _, err := svc.CreateSeasonAnimes(context.Background(), []string{"sa-a"}, "", nil); err == nil {
		t.Fatal("CreateSeasonAnimes without a gateway must error")
	}
}

func TestHandleAnimeWatchedMovesVerHoyToVisto(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")

	sa := domain.NewSeasonAnime("sa-1", season.ID, "Anime A", svc.now())
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	_ = repo.CreateSeasonAnime(ctx, sa)

	if err := svc.HandleAnimeWatched(ctx, "anime-a", "Ver hoy", 1); err != nil {
		t.Fatalf("HandleAnimeWatched: %v", err)
	}
	if gateway.moved["anime-a"] != "Visto" {
		t.Fatalf("expected move to Visto, got %q", gateway.moved["anime-a"])
	}
}

func TestHandleAnimeWatchedIgnoresNonVerHoyAndUnwatched(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	sa := domain.NewSeasonAnime("sa-1", season.ID, "Anime A", svc.now())
	sa.Availability = domain.AvailabilityCreated
	sa.AnimeID = "anime-a"
	_ = repo.CreateSeasonAnime(ctx, sa)

	_ = svc.HandleAnimeWatched(ctx, "anime-a", "Sin ver", 3)
	_ = svc.HandleAnimeWatched(ctx, "anime-a", "Ver hoy", 0)
	_ = svc.HandleAnimeWatched(ctx, "other", "Ver hoy", 5)

	if len(gateway.moved) != 0 {
		t.Fatalf("expected no moves, got %+v", gateway.moved)
	}
}
