package desktop

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
	bridgeSync "autoreas-bridge/internal/sync"
)

type appliedDaysEpisodeService struct {
	*stubAppEpisodeService
}

func (s *appliedDaysEpisodeService) SetAnimeDays(_ context.Context, cmd anime.SetAnimeDaysCommand) (anime.EpisodeCommandResult, error) {
	s.lastDays = cmd
	return anime.EpisodeCommandResult{AnimeID: cmd.AnimeID, Outcome: anime.PatchOutcomeApplied}, s.err
}

// fakeSeasonRepo is an in-memory season.Repository for binding tests.
type fakeSeasonRepo struct {
	seasons   map[string]domain.Season
	order     []string
	createErr error
	activeErr error
	// seasonByIDErr simulates a repository read that fails after populating its
	// destination; callers must treat the read as failed and must never surface
	// the partially-read season.
	seasonByIDErr error
	animes        map[string]domain.SeasonAnime
	animesOrder   []string
	animesErr     error
}

// newFakeSeasonRepo creates an in-memory season repository for tests.
func newFakeSeasonRepo() *fakeSeasonRepo {
	return &fakeSeasonRepo{seasons: map[string]domain.Season{}}
}

func (r *fakeSeasonRepo) CreateSeason(_ context.Context, seasonValue domain.Season) error {
	if r.createErr != nil {
		return r.createErr
	}
	r.seasons[seasonValue.ID] = seasonValue
	r.order = append(r.order, seasonValue.ID)
	return nil
}

func (r *fakeSeasonRepo) ActiveSeason(_ context.Context) (*domain.Season, error) {
	if r.activeErr != nil {
		return nil, r.activeErr
	}
	for _, id := range r.order {
		if seasonValue := r.seasons[id]; seasonValue.Status == domain.StatusOpen {
			copy := seasonValue
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *fakeSeasonRepo) UpdateSeason(_ context.Context, seasonValue domain.Season) error {
	r.seasons[seasonValue.ID] = seasonValue
	return nil
}

func (r *fakeSeasonRepo) ListSeasons(_ context.Context) ([]domain.Season, error) {
	out := make([]domain.Season, 0, len(r.order))
	for _, v := range slices.Backward(r.order) {
		out = append(out, r.seasons[v])
	}
	return out, nil
}

func (r *fakeSeasonRepo) SeasonByID(_ context.Context, id string) (*domain.Season, error) {
	seasonValue, ok := r.seasons[id]
	if !ok {
		return nil, nil
	}
	copy := seasonValue
	if r.seasonByIDErr != nil {
		return &copy, r.seasonByIDErr
	}
	return &copy, nil
}

func (r *fakeSeasonRepo) CreateSeasonAnime(_ context.Context, seasonAnime domain.SeasonAnime) error {
	if r.animes == nil {
		r.animes = map[string]domain.SeasonAnime{}
	}
	r.animes[seasonAnime.ID] = seasonAnime
	r.animesOrder = append(r.animesOrder, seasonAnime.ID)
	return nil
}

func (r *fakeSeasonRepo) ListSeasonAnimes(_ context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	if r.animesErr != nil {
		return nil, r.animesErr
	}
	var out []domain.SeasonAnime
	for _, id := range r.animesOrder {
		if seasonAnime := r.animes[id]; seasonAnime.SeasonID == seasonID {
			out = append(out, seasonAnime)
		}
	}
	return out, nil
}

func (r *fakeSeasonRepo) SeasonAnimeByID(_ context.Context, id string) (*domain.SeasonAnime, error) {
	seasonAnime, ok := r.animes[id]
	if !ok {
		return nil, nil
	}
	copy := seasonAnime
	return &copy, nil
}

func (r *fakeSeasonRepo) UpdateSeasonAnime(_ context.Context, seasonAnime domain.SeasonAnime) error {
	r.animes[seasonAnime.ID] = seasonAnime
	return nil
}

// newTestSeasonApp creates an application backed by a test season service. An
// empty anime query is wired by default so board-capturing bindings (CloseSeason)
// read live data instead of failing; tests needing specific animes overwrite it.
func newTestSeasonApp(repo season.Repository, hub *stubAppRealtimeHub) *App {
	fixed := time.UnixMilli(1_700_000_000_000)
	nextID := 0
	service := season.NewService(repo, func() time.Time { return fixed }, func() string {
		nextID++
		return fmt.Sprintf("id-%d", nextID)
	}, nil)
	app := &App{ctx: context.Background(), seasonService: service, animeQuery: &stubAnimeQueryService{}}
	if hub != nil {
		app.realtimeHub = hub
	}
	return app
}

type fakeAppNameSearcher struct {
	byQuery map[string][]match.Candidate
}

func (f fakeAppNameSearcher) Search(_ context.Context, query string) ([]match.Candidate, error) {
	return f.byQuery[query], nil
}

type fakeAppAvailabilityProbe struct {
	episodes map[string]int
}

func (f fakeAppAvailabilityProbe) AvailableEpisodes(_ context.Context, pageURL string) (int, error) {
	return f.episodes[pageURL], nil
}

// confirmedSeasonMetadata is one fully-confirmed lookup as the season intake row
// carries it: every field the frontend can confirm for one row. The title is
// absent by design — the row's raw name is the anime's name.
func confirmedSeasonMetadata() season.AnimeCreateMetadata {
	kind, total, duration := 2, 24, 45
	return season.AnimeCreateMetadata{
		Kind:            &kind,
		TotalEpisodes:   &total,
		DurationMinutes: &duration,
		Origin:          "Manga",
		Genres:          []string{"Adventure", "Drama"},
		Studios:         []string{"Madhouse"},
		Cover:           &season.AnimeCreateCover{Type: "url", Path: "https://cdn.myanimelist.net/images/anime/frieren.jpg"},
	}
}

// runtimeSeasonFixture is a season app wired to a REAL temp-SQLite anime store,
// so a binding test observes the record SQLite actually holds.
type runtimeSeasonFixture struct {
	app   *App
	repo  *fakeSeasonRepo
	store *bridgeSync.AnimeSnapshotStore
}

// newRuntimeSeasonFixture wires the real anime create pipeline over a temp SQLite
// database into a test App whose season gateway carries per-row metadata.
func newRuntimeSeasonFixture(t *testing.T) runtimeSeasonFixture {
	t.Helper()
	store := bridgeSync.NewAnimeSnapshotStore(openRuntimeBridgeDB(t))
	write := anime.NewWriteService(store, &stubAppUpdateWriter{})
	write.SetIDGen(func() string { return "created-anime" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })
	creator := anime.NewCreateService(write)
	readQuery := &stubAnimeReadQuery{}
	creator.SetQuery(readQuery)

	repo := newFakeSeasonRepo()
	app := newTestSeasonApp(repo, nil)
	app.seasonService.SetAvailabilityDeps(nil, seasonAnimeGateway{writer: write, creator: creator, records: readQuery})
	return runtimeSeasonFixture{app: app, repo: repo, store: store}
}

// seedAvailableRow opens the fixture's season and adds one AVAILABLE intake row.
func (f runtimeSeasonFixture) seedAvailableRow(t *testing.T, rowID, name, pageURL string) {
	t.Helper()
	if got := f.app.CreateSeason("Julio 2026"); got != "ok" {
		t.Fatalf("CreateSeason: %q", got)
	}
	active, err := f.app.seasonService.ActiveSeason(context.Background())
	if err != nil || active == nil {
		t.Fatalf("ActiveSeason: %v, %#v", err, active)
	}
	row := domain.NewSeasonAnime(rowID, active.ID, name, time.UnixMilli(0))
	row.MatchStatus = domain.MatchMatched
	row.MatchedSlug = pageURL
	row.Availability = domain.AvailabilityAvailable
	row.AvailableEpisodes = 1
	if err := f.repo.CreateSeasonAnime(context.Background(), row); err != nil {
		t.Fatalf("seed row: %v", err)
	}
}

// createdAnimeRecord is the canonical snapshot shape a season create writes,
// decoded so a test asserts stored values instead of raw JSON keys.
type createdAnimeRecord struct {
	Name            string   `json:"name"`
	SourceURL       string   `json:"sourceUrl"`
	Folder          string   `json:"folder"`
	Kind            *int     `json:"kind"`
	TotalEpisodes   *int     `json:"totalEpisodes"`
	DurationMinutes *int     `json:"durationMinutes"`
	Origin          string   `json:"origin"`
	Genres          []string `json:"genres"`
	Studios         []string `json:"studios"`
	EpisodesWatched int      `json:"episodesWatched"`
	Cover           struct {
		Type string `json:"type"`
		Path string `json:"path"`
	} `json:"cover"`
	Days []struct {
		Day   string `json:"day"`
		Order int    `json:"order"`
	} `json:"days"`
}

// readCreatedAnime decodes one persisted anime snapshot and reports whether the
// stored record carries a premiere/first-watch date at all.
func readCreatedAnime(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string) (createdAnimeRecord, bool) {
	t.Helper()
	snapshot, err := store.GetSnapshot(context.Background(), animeID)
	if err != nil {
		t.Fatalf("GetSnapshot(%s): %v", animeID, err)
	}
	var record createdAnimeRecord
	if err := json.Unmarshal(snapshot.CanonicalJSON, &record); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.CanonicalJSON, &keys); err != nil {
		t.Fatalf("decode snapshot keys: %v", err)
	}
	_, hasPremiere := keys["premieredAt"]
	return record, hasPremiere
}

// seasonAnimeMetadataJSONTags returns the json names of season.AnimeCreateMetadata
// exactly as Wails publishes them to the frontend.
func seasonAnimeMetadataJSONTags(t *testing.T) []string {
	t.Helper()
	typ := reflect.TypeOf(season.AnimeCreateMetadata{})
	tags := make([]string, 0, typ.NumField())
	for i := 0; i < typ.NumField(); i++ {
		name := strings.Split(typ.Field(i).Tag.Get("json"), ",")[0]
		if name == "" || name == "-" {
			t.Fatalf("field %s of season.AnimeCreateMetadata has no json name", typ.Field(i).Name)
		}
		tags = append(tags, name)
	}
	return tags
}

// canonicalAnimeCreateJSONKeys builds a canonical anime through the real anime
// create path with every optional field set and returns the JSON keys it
// produced. The season metadata names must be a subset of these keys.
func canonicalAnimeCreateJSONKeys(t *testing.T) map[string]struct{} {
	t.Helper()
	write := anime.NewWriteService(nil, nil)
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000) })
	kind, total, duration := 0, 24, 45
	operation, _, err := write.BuildCreateOperation(contracts.AnimeCreate{
		ID:              "created-anime",
		Nombre:          "Frieren",
		Pagina:          "https://jkanime.net/frieren/",
		Dias:            []contracts.Placement{{Day: "Sin ver", Order: 1}},
		Carpeta:         "D:/Anime/Frieren",
		Tipo:            &kind,
		TotalEpisodes:   &total,
		DurationMinutes: &duration,
		Origin:          "Manga",
		Genres:          []string{"Adventure"},
		Studios:         []string{"Madhouse"},
		Cover:           &contracts.AnimeCreateCover{Type: "url", Path: "https://cdn.myanimelist.net/images/anime/frieren.jpg"},
	}, anime.CreateMetadata{})
	if err != nil {
		t.Fatalf("BuildCreateOperation: %v", err)
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(operation.Desired, &keys); err != nil {
		t.Fatalf("decode canonical create keys: %v", err)
	}
	out := make(map[string]struct{}, len(keys))
	for key := range keys {
		out[key] = struct{}{}
	}
	return out
}
