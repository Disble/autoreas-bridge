package season

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// RecheckAvailability ONLY reports availability — it NEVER creates an anime.
// Creation is a separate, explicit, consent-gated action (CreateSeasonAnimes).
func TestRecheckAvailabilityMarksAvailableNeverCreates(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{episodes: map[string]int{
		"https://jkanime.net/a/": 3, // available (3 episodes)
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
	if a := byID["sa-a"]; a.Availability != domain.AvailabilityAvailable || a.AvailableEpisodes != 3 || a.AnimeID != "" {
		t.Fatalf("A should be available with 3 episodes and NOT created, got %+v", a)
	}
	if b := byID["sa-b"]; b.Availability != domain.AvailabilityWaiting || b.AvailableEpisodes != 0 {
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
	probe := &fakeProbe{episodes: map[string]int{"https://jkanime.net/a/": 1}}
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

// A created row still parked in "Sin ver" MUST have its AvailableEpisodes
// refreshed live; Availability, MatchStatus, AnimeID stay untouched and the
// row is never reported in res.Available (ADR-3, ADR-4).
func TestRecheckAvailabilityRefreshesSinVerCreatedRow(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{episodes: map[string]int{"https://jkanime.net/created/": 5}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-created": {{Dia: sinVerSection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, createdSeed{
		seasonID: season.ID, id: "sa-created", name: "Anime Created",
		slug: "https://jkanime.net/created/", animeID: "anime-created", episodes: 2,
	})

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-created")
	if row.AvailableEpisodes != 5 {
		t.Fatalf("AvailableEpisodes = %d, want 5", row.AvailableEpisodes)
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

func TestRecheckAvailabilitySkipsCreatedRowsInSpecialQueues(t *testing.T) {
	for _, test := range []struct {
		name, section string
		available     int
	}{
		{"Ver hoy", verHoySection, 3}, {"Visto", vistoSection, 4},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := newFakeRepo()
			svc := newTestService(repo)
			animeID := "anime-" + test.name
			svc.SetAvailabilityDeps(&fakeProbe{episodes: map[string]int{"https://jkanime.net/" + test.name: 9}}, &fakeGateway{placements: map[string][]domain.Placement{animeID: {{Dia: test.section, Orden: 1}}}})
			ctx := context.Background()
			season, _ := svc.CreateSeason(ctx, "Julio 2026")
			rowID := "sa-" + test.name
			seedCreated(t, svc, repo, createdSeed{
				seasonID: season.ID, id: rowID, name: "Anime " + test.name,
				slug: "https://jkanime.net/" + test.name, animeID: animeID, episodes: test.available,
			})
			res, err := svc.RecheckAvailability(ctx, season.ID)
			if err != nil {
				t.Fatalf("RecheckAvailability: %v", err)
			}
			if row := findRow(t, svc, season.ID, rowID); row.AvailableEpisodes != test.available {
				t.Fatalf("AvailableEpisodes = %d, want %d", row.AvailableEpisodes, test.available)
			}
			if res.Checked != 0 {
				t.Fatalf("res.Checked = %d, want 0", res.Checked)
			}
		})
	}
}

// A created row whose anime id has no entry in CurrentPlacements' result
// (empty/absent placements) must be skipped exactly like an unresolvable row
// is today.
func TestRecheckAvailabilitySkipsCreatedRowWithNoResolvableSection(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{episodes: map[string]int{"https://jkanime.net/unresolved/": 9}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, createdSeed{
		seasonID: season.ID, id: "sa-unresolved", name: "Anime Unresolved",
		slug: "https://jkanime.net/unresolved/", animeID: "anime-unresolved", episodes: 1,
	})

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability: %v", err)
	}

	row := findRow(t, svc, season.ID, "sa-unresolved")
	if row.AvailableEpisodes != 1 {
		t.Fatalf("AvailableEpisodes must stay frozen at 1, got %d", row.AvailableEpisodes)
	}
	if res.Checked != 0 {
		t.Fatalf("res.Checked = %d, want 0 (unresolvable row must not be probed)", res.Checked)
	}
}

// If gateway.CurrentPlacements errors, every created row is left untouched
// this run, but the existing matched-uncreated path still runs and the call
// as a whole does not fail.
func TestRecheckAvailabilityToleratesPlacementsError(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	probe := &fakeProbe{episodes: map[string]int{
		"https://jkanime.net/created/": 9,
		"https://jkanime.net/a/":       3,
	}}
	gateway := &gatewayPlacementsErr{}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, createdSeed{
		seasonID: season.ID, id: "sa-created", name: "Anime Created",
		slug: "https://jkanime.net/created/", animeID: "anime-created", episodes: 2,
	})
	seedMatched(t, svc, repo, season.ID, "sa-a", "Anime A", "https://jkanime.net/a/")

	res, err := svc.RecheckAvailability(ctx, season.ID)
	if err != nil {
		t.Fatalf("RecheckAvailability must not fail on a placements lookup error: %v", err)
	}

	created := findRow(t, svc, season.ID, "sa-created")
	if created.AvailableEpisodes != 2 {
		t.Fatalf("created row must stay untouched on placements error, got %d", created.AvailableEpisodes)
	}

	matched := findRow(t, svc, season.ID, "sa-a")
	if matched.Availability != domain.AvailabilityAvailable || matched.AvailableEpisodes != 3 {
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
	probe := &fakeProbe{episodes: map[string]int{"https://jkanime.net/created/": 5}}
	gateway := &fakeGateway{placements: map[string][]domain.Placement{
		"anime-created": {{Dia: sinVerSection, Orden: 1}},
	}}
	svc.SetAvailabilityDeps(probe, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedCreated(t, svc, repo, createdSeed{
		seasonID: season.ID, id: "sa-created", name: "Anime Created",
		slug: "https://jkanime.net/created/", animeID: "anime-created", episodes: 2,
	})

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
	if second.AvailableEpisodes != 5 {
		t.Fatalf("AvailableEpisodes = %d, want 5", second.AvailableEpisodes)
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
		sa.AvailableEpisodes = 2
		_ = repo.CreateSeasonAnime(ctx, sa)
	}
	mkAvail("sa-a", "Anime A", "https://jkanime.net/a/")
	seedMatched(t, svc, repo, season.ID, "sa-b", "Anime B", "https://jkanime.net/b/") // waiting
	mkAvail("sa-c", "Anime C", "https://jkanime.net/c/")

	res, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a", "sa-b", "sa-c"}, "", nil, nil)
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
	if gateway.created[0].Tipo == nil || *gateway.created[0].Tipo != 0 {
		t.Fatalf("created anime must carry default tipo=0 (Anime (TV)), got %#v", gateway.created[0].Tipo)
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

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a", "sa-b", "sa-c"}, root, overrides, nil); err != nil {
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

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, "", nil, nil); err != nil {
		t.Fatalf("first create: %v", err)
	}
	res, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, "", nil, nil)
	if err != nil {
		t.Fatalf("second create: %v", err)
	}
	if len(res.Created) != 0 || len(gateway.created) != 1 {
		t.Fatalf("an already-created row must not be created again: res=%v created=%d", res.Created, len(gateway.created))
	}
}

func TestCreateSeasonAnimesRequiresGateway(t *testing.T) {
	svc := newTestService(newFakeRepo())
	if _, err := svc.CreateSeasonAnimes(context.Background(), []string{"sa-a"}, "", nil, nil); err == nil {
		t.Fatal("CreateSeasonAnimes without a gateway must error")
	}
}

// confirmedAnimeMetadata is one fully-confirmed MyAnimeList lookup: every field
// an intake row can carry into its new anime. The title is absent by design — the
// row's raw name is the anime's name.
func confirmedAnimeMetadata() AnimeCreateMetadata {
	kind, total, duration := 2, 24, 45
	return AnimeCreateMetadata{
		Kind:            &kind,
		TotalEpisodes:   &total,
		DurationMinutes: &duration,
		Origin:          "Manga",
		Genres:          []string{"Adventure", "Drama"},
		Studios:         []string{"Madhouse"},
		Cover:           &AnimeCreateCover{Type: "url", Path: "https://cdn.myanimelist.net/images/anime/frieren.jpg"},
	}
}

// seedAvailable adds a matched, AVAILABLE intake row (episode 1 is online), the
// only state CreateSeasonAnimes ever acts on.
func seedAvailable(t *testing.T, svc *Service, repo *fakeRepo, seasonID, id, name, slug string) {
	t.Helper()
	sa := domain.NewSeasonAnime(id, seasonID, name, svc.now())
	sa.MatchStatus = domain.MatchMatched
	sa.MatchedSlug = slug
	sa.Availability = domain.AvailabilityAvailable
	sa.AvailableEpisodes = 1
	if err := repo.CreateSeasonAnime(context.Background(), sa); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

// Creating a row without confirmed metadata must build exactly the create input
// this path built before metadata existed: same name, page, section, folder and
// default tipo, and no metadata pointer at all.
func TestCreateSeasonAnimesWithoutMetadataCreatesUnchangedInput(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedAvailable(t, svc, repo, season.ID, "sa-a", "Frieren", "https://jkanime.net/frieren/")

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, filepath.Join("D:", "Anime"), nil, nil); err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}

	if len(gateway.created) != 1 {
		t.Fatalf("creates = %d, want 1", len(gateway.created))
	}
	defaultTipo := defaultAnimeType
	want := AnimeCreateInput{
		Nombre:  "Frieren",
		Pagina:  "https://jkanime.net/frieren/",
		Section: sinVerSection,
		Carpeta: filepath.Join("D:", "Anime", "Frieren"),
		Tipo:    &defaultTipo,
	}
	if got := gateway.created[0]; !reflect.DeepEqual(got, want) {
		t.Fatalf("create input = %#v, want %#v", got, want)
	}
}

// Each intake row carries only ITS OWN confirmed metadata, and a row with none
// creates exactly what it creates today. The row's raw name, matched page and
// resolved folder always win over anything the lookup confirmed.
func TestCreateSeasonAnimesCarriesPerRowMetadataToTheGateway(t *testing.T) {
	confirmed := confirmedAnimeMetadata()
	emptyMetadata := AnimeCreateMetadata{}

	tests := []struct {
		name         string
		metadata     map[string]AnimeCreateMetadata
		wantMetadata *AnimeCreateMetadata
	}{
		{name: "no metadata lookup", metadata: nil},
		{name: "empty lookup", metadata: map[string]AnimeCreateMetadata{}},
		{name: "lookup entry for another row", metadata: map[string]AnimeCreateMetadata{"sa-other": confirmed}},
		{name: "entry that confirmed nothing for the created row", metadata: map[string]AnimeCreateMetadata{"sa-a": {}}, wantMetadata: &emptyMetadata},
		{name: "confirmed entry for the created row", metadata: map[string]AnimeCreateMetadata{"sa-a": confirmed}, wantMetadata: &confirmed},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assertSeasonAnimeCreateCarriesMetadata(t, test.metadata, test.wantMetadata)
		})
	}
}

// assertSeasonAnimeCreateCarriesMetadata creates the fixture's one available row
// with the given per-row lookup and asserts the gateway received exactly the
// expected metadata while the user's own name, page and folder still won.
func assertSeasonAnimeCreateCarriesMetadata(t *testing.T, metadata map[string]AnimeCreateMetadata, wantMetadata *AnimeCreateMetadata) {
	t.Helper()
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedAvailable(t, svc, repo, season.ID, "sa-a", "Frieren", "https://jkanime.net/frieren/")
	folderOverride := filepath.Join("E:", "Anime", "Frieren")

	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a"}, "", map[string]string{"sa-a": folderOverride}, metadata); err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}
	if len(gateway.created) != 1 {
		t.Fatalf("creates = %d, want 1", len(gateway.created))
	}
	got := gateway.created[0]
	if !reflect.DeepEqual(got.Metadata, wantMetadata) {
		t.Fatalf("gateway metadata = %#v, want %#v", got.Metadata, wantMetadata)
	}
	if got.Nombre != "Frieren" {
		t.Fatalf("created name = %q, want the row's raw name", got.Nombre)
	}
	if got.Pagina != "https://jkanime.net/frieren/" || got.Section != sinVerSection {
		t.Fatalf("page/section = %q/%q, want the matched page in %q", got.Pagina, got.Section, sinVerSection)
	}
	if got.Carpeta != folderOverride {
		t.Fatalf("folder = %q, want the user's override %q", got.Carpeta, folderOverride)
	}
	if got.Tipo == nil || *got.Tipo != defaultAnimeType {
		t.Fatalf("tipo = %#v, want the season default %d", got.Tipo, defaultAnimeType)
	}
}

// A metadata entry for a row this run does not create (waiting, linked to an
// existing anime, or an id no row matches) must never leak into the create of a
// row that IS created.
func TestCreateSeasonAnimesIgnoresMetadataForRowsItDoesNotCreate(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	gateway := &fakeGateway{existingByPagina: map[string]string{"https://jkanime.net/linked/": "existing-anime"}}
	svc.SetAvailabilityDeps(&fakeProbe{}, gateway)

	ctx := context.Background()
	season, _ := svc.CreateSeason(ctx, "Julio 2026")
	seedAvailable(t, svc, repo, season.ID, "sa-a", "Frieren", "https://jkanime.net/frieren/")
	seedMatched(t, svc, repo, season.ID, "sa-waiting", "Dandadan", "https://jkanime.net/dandadan/")
	seedAvailable(t, svc, repo, season.ID, "sa-linked", "Linked", "https://jkanime.net/linked/")

	metadata := map[string]AnimeCreateMetadata{
		"sa-waiting": confirmedAnimeMetadata(),
		"sa-linked":  confirmedAnimeMetadata(),
		"sa-unknown": confirmedAnimeMetadata(),
	}
	if _, err := svc.CreateSeasonAnimes(ctx, []string{"sa-a", "sa-waiting", "sa-linked", "sa-unknown"}, "", nil, metadata); err != nil {
		t.Fatalf("CreateSeasonAnimes: %v", err)
	}

	if len(gateway.created) != 1 {
		t.Fatalf("creates = %d, want only the available unlinked row", len(gateway.created))
	}
	if got := gateway.created[0]; got.Pagina != "https://jkanime.net/frieren/" || got.Metadata != nil {
		t.Fatalf("metadata of a row that was not created leaked into the create: %#v", got)
	}
	if linked := findRow(t, svc, season.ID, "sa-linked"); linked.AnimeID != "existing-anime" || linked.Availability != domain.AvailabilityCreated {
		t.Fatalf("the linked row must keep linking instead of creating: %+v", linked)
	}
}
