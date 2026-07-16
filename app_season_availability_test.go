package main

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/download/sites"
	"autoreas-bridge/internal/season"
)

// fakeEpisodeSource is a minimal sites.EpisodeSource returning a fixed listing.
type fakeEpisodeSource struct {
	latest int
	err    error
}

func (f fakeEpisodeSource) Descriptor() sites.SiteDescriptor {
	return sites.SiteDescriptor{Name: "fake"}
}
func (f fakeEpisodeSource) Matches(string) bool { return true }
func (f fakeEpisodeSource) ListEpisodes(context.Context, string) (sites.EpisodeListing, error) {
	return sites.EpisodeListing{LatestEpisode: f.latest}, f.err
}
func (f fakeEpisodeSource) EpisodePageURL(context.Context, string, int) (string, error) {
	return "", nil
}
func (f fakeEpisodeSource) ExtractLinks(context.Context, string) ([]sites.DownloadLink, error) {
	return nil, nil
}

// fakeRegistry resolves every URL to a fixed source, or a resolve error.
type fakeRegistry struct {
	source     sites.EpisodeSource
	resolveErr error
}

func (r fakeRegistry) Resolve(string) (sites.EpisodeSource, error) {
	if r.resolveErr != nil {
		return nil, r.resolveErr
	}
	return r.source, nil
}

func TestSeasonAvailabilityProbe(t *testing.T) {
	ctx := context.Background()

	yes := seasonAvailabilityProbe{registry: fakeRegistry{source: fakeEpisodeSource{latest: 2}}}
	if n, err := yes.AvailableChapters(ctx, "https://jkanime.net/a/"); err != nil || n != 2 {
		t.Fatalf("latest 2 → 2 chapters; got n=%d err=%v", n, err)
	}

	no := seasonAvailabilityProbe{registry: fakeRegistry{source: fakeEpisodeSource{latest: 0}}}
	if n, err := no.AvailableChapters(ctx, "https://jkanime.net/b/"); err != nil || n != 0 {
		t.Fatalf("latest 0 → 0 chapters; got n=%d err=%v", n, err)
	}

	unsupported := seasonAvailabilityProbe{registry: fakeRegistry{resolveErr: errors.New("unsupported")}}
	if n, err := unsupported.AvailableChapters(ctx, "https://other.site/x/"); err != nil || n != 0 {
		t.Fatalf("unsupported site → (0, nil); got n=%d err=%v", n, err)
	}
}

func TestSeasonAnimeMetadataProviderKeepsLatestEpisodeSeparateFromAnnouncedTotal(t *testing.T) {
	provider := seasonAnimeMetadataProvider{registry: fakeRegistry{source: fakeEpisodeSource{latest: 17}}}

	metadata, err := provider.Lookup(context.Background(), "https://jkanime.net/airing/")
	if err != nil {
		t.Fatalf("Lookup: %v", err)
	}
	if metadata.LatestEpisode == nil || *metadata.LatestEpisode != 17 {
		t.Fatalf("LatestEpisode = %v, want 17", metadata.LatestEpisode)
	}
	if metadata.AnnouncedTotal != nil {
		t.Fatalf("AnnouncedTotal = %v, want unknown; latest aired is not an announced total", metadata.AnnouncedTotal)
	}
}

func TestSeasonAnimeMetadataProviderReturnsSourceFailures(t *testing.T) {
	sourceErr := errors.New("metadata fetch failed")
	provider := seasonAnimeMetadataProvider{registry: fakeRegistry{source: fakeEpisodeSource{err: sourceErr}}}

	if _, err := provider.Lookup(context.Background(), "https://jkanime.net/failing/"); !errors.Is(err, sourceErr) {
		t.Fatalf("Lookup error = %v, want source error", err)
	}
}

// fakeReadRecordLister returns the English read model exposed by the anime query service.
type fakeReadRecordLister struct {
	records []anime.ReadRecord
	err     error
}

func (f fakeReadRecordLister) ListReadRecords(context.Context) ([]anime.ReadRecord, error) {
	return f.records, f.err
}

type stubAnimeReadQuery struct {
	stubAnimeQueryService
	records []anime.ReadRecord
	err     error
}

func (s *stubAnimeReadQuery) ListReadRecords(context.Context) ([]anime.ReadRecord, error) {
	return s.records, s.err
}

func (s *stubAnimeReadQuery) GetReadRecord(_ context.Context, id string) (anime.ReadRecord, error) {
	if s.err != nil {
		return anime.ReadRecord{}, s.err
	}
	for _, record := range s.records {
		if record.Value.ID == id {
			return record, nil
		}
	}
	return anime.ReadRecord{}, errors.New("anime not found")
}

func TestAnimeSectionsByIDUsesEnglishReadRecords(t *testing.T) {
	app := &App{animeQuery: &stubAnimeReadQuery{records: []anime.ReadRecord{
		{Value: domain.Anime{ID: "anime-1", Days: []domain.AnimeDay{{Day: "Sin ver", Order: 1}}}},
		{Value: domain.Anime{ID: "anime-2", Days: []domain.AnimeDay{{Day: "Visto", Order: 2}}}},
	}}}

	got := app.animeSectionsByID(context.Background())
	if got["anime-1"] != "Sin ver" || got["anime-2"] != "Visto" {
		t.Fatalf("animeSectionsByID() = %#v, want English read-record sections", got)
	}
}

func TestAnimeWatchedStateUsesEnglishLegacyProjectionWithoutStoreAccess(t *testing.T) {
	section, progress, ok := animeWatchedState([]byte(`{"_id":"anime-1","nrocapvisto":4,"dias":[{"dia":"Ver hoy","orden":1}]}`))
	if !ok || section != "Ver hoy" || progress != 4 {
		t.Fatalf("animeWatchedState() = (%q, %v, %v), want (Ver hoy, 4, true)", section, progress, ok)
	}
	if _, _, ok := animeWatchedState([]byte(`{"_id":`)); ok {
		t.Fatal("animeWatchedState malformed payload accepted")
	}
}

type fakeSeasonAnimeCreator struct {
	calls      int
	lastCreate contracts.AnimeCreate
	result     anime.AnimePatchResult
	err        error
}

func (f *fakeSeasonAnimeCreator) CreateAnime(_ context.Context, create contracts.AnimeCreate) (anime.AnimePatchResult, error) {
	f.calls++
	f.lastCreate = create
	return f.result, f.err
}

func TestSeasonAnimeGatewayCreatePreservesAuthoritativeResult(t *testing.T) {
	creator := &fakeSeasonAnimeCreator{result: anime.AnimePatchResult{
		AnimeID: "created-anime", Outcome: anime.AnimePatchOutcomeApplied, ModifiedAt: 1710000000123,
	}}
	gateway := seasonAnimeGateway{creator: creator, records: fakeReadRecordLister{}}

	tipo := 0
	got, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
		Nombre: "Frieren", Pagina: "https://jkanime.net/frieren/", Section: "Sin ver", Tipo: &tipo,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	want := season.AnimeMutationResult{AnimeID: "created-anime", Outcome: season.AnimeMutationApplied, ModifiedAt: 1710000000123}
	if got != want {
		t.Fatalf("CreateAnime result = %#v, want %#v", got, want)
	}
	if creator.lastCreate.Tipo == nil || *creator.lastCreate.Tipo != 0 {
		t.Fatalf("CreateAnime must forward tipo=0, got %#v", creator.lastCreate.Tipo)
	}
}

func TestSeasonAnimeGatewayFindActiveByPagina(t *testing.T) {
	ctx := context.Background()
	activeURL := "https://jkanime.net/a/"
	inactiveURL := "https://jkanime.net/b/"
	gw := seasonAnimeGateway{records: fakeReadRecordLister{records: []anime.ReadRecord{
		{Value: domain.Anime{ID: "active-1", Active: domain.TriStateTrue, SourceURL: &activeURL}},
		{Value: domain.Anime{ID: "inactive-1", Active: domain.TriStateFalse, SourceURL: &inactiveURL}},
	}}}

	if id, found, err := gw.FindActiveByPagina(ctx, "https://jkanime.net/a/"); err != nil || !found || id != "active-1" {
		t.Fatalf("active match: id=%q found=%v err=%v", id, found, err)
	}
	if _, found, _ := gw.FindActiveByPagina(ctx, "https://jkanime.net/b/"); found {
		t.Fatal("inactive anime must not match")
	}
	if _, found, _ := gw.FindActiveByPagina(ctx, "https://jkanime.net/none/"); found {
		t.Fatal("no match expected")
	}
}

func TestSeasonAnimeGatewayNextOrden(t *testing.T) {
	ctx := context.Background()
	gw := seasonAnimeGateway{records: fakeReadRecordLister{records: []anime.ReadRecord{
		{Value: domain.Anime{ID: "x", Days: []domain.AnimeDay{{Day: "Sin ver", Order: 3}}}},
		{Value: domain.Anime{ID: "y", Days: []domain.AnimeDay{{Day: "Sin ver", Order: 5}}}},
		{Value: domain.Anime{ID: "z", Days: []domain.AnimeDay{{Day: "Visto", Order: 9}}}},
	}}}
	got, err := gw.nextOrden(ctx, "Sin ver")
	if err != nil {
		t.Fatalf("nextOrden(Sin ver): %v", err)
	}
	if got != 6 {
		t.Fatalf("nextOrden(Sin ver) = %d, want 6", got)
	}
}

func TestSeasonAnimeGatewayNextOrdenStartsAtOneForEmptyValidSnapshotList(t *testing.T) {
	gateway := seasonAnimeGateway{records: fakeReadRecordLister{}}

	got, err := gateway.nextOrden(context.Background(), "Sin ver")
	if err != nil {
		t.Fatalf("nextOrden(empty): %v", err)
	}
	if got != 1 {
		t.Fatalf("nextOrden(empty) = %d, want 1", got)
	}
}

func TestSeasonAnimeGatewayCreateFailsBeforeCreatorWhenOrderCannotBeRead(t *testing.T) {
	readErr := errors.New("anime read model unavailable")
	projectionErr := errors.New("legacy snapshot projection failed")
	tests := []struct {
		name    string
		records fakeReadRecordLister
		wantErr error
	}{
		{
			name:    "read model listing fails",
			records: fakeReadRecordLister{err: readErr},
			wantErr: readErr,
		},
		{
			name:    "legacy projection fails before crossing the query boundary",
			records: fakeReadRecordLister{err: projectionErr},
			wantErr: projectionErr,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			creator := &fakeSeasonAnimeCreator{}
			gateway := seasonAnimeGateway{creator: creator, records: test.records}

			result, err := gateway.CreateAnime(context.Background(), season.AnimeCreateInput{
				Nombre: "Must Not Persist", Pagina: "https://example.test/no-write", Section: "Sin ver",
			})
			if err == nil {
				t.Fatal("CreateAnime error = nil, want snapshot read/parse failure")
			}
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("CreateAnime error = %v, want %v", err, test.wantErr)
			}
			if result != (season.AnimeMutationResult{}) {
				t.Fatalf("CreateAnime result = %#v, want zero on pre-create failure", result)
			}
			if creator.calls != 0 {
				t.Fatalf("downstream creator calls = %d, want zero", creator.calls)
			}
		})
	}
}

func TestSeasonScheduleStoreFixedConfig(t *testing.T) {
	store := &seasonScheduleStore{}
	cfg, err := store.GetScheduleConfig(context.Background())
	if err != nil {
		t.Fatalf("GetScheduleConfig: %v", err)
	}
	if cfg.DailyTimeHHMM != "21:00" || !cfg.Enabled || cfg.EnabledWeekdays != 0x7F {
		t.Fatalf("unexpected fixed config: %+v", cfg)
	}
}
