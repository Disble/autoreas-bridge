package anime_test

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func TestQueryServiceGetEffectiveAnimeReturnsInactiveAnime(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"id":"anime-1","name":"Test","episodesWatched":4,"totalEpisodes":12,"active":false}`)

	service := anime.NewQueryService(store)
	got, err := service.GetEffectiveAnime(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get effective anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected effective anime, got nil")
	}
	if got.ID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", got.ID)
	}
	if got.TotalCap == nil || *got.TotalCap != 12 {
		t.Fatalf("expected totalcap 12, got %#v", got.TotalCap)
	}
	if got.Activo == nil || *got.Activo {
		t.Fatalf("expected activo false, got %#v", got.Activo)
	}
	if len(got.SnapshotJSON) == 0 {
		t.Fatal("expected raw snapshot json to be returned")
	}
}

func TestQueryServiceListMobileAnimesNormalizesLegacyPayload(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{
		"id":"anime-1",
		"name":"Samurai X",
		"status":2,
		"episodesWatched":10.5,
		"totalEpisodes":95,
		"active":true,
		"firstCycle":false,
		"days":[{"day":"Miércoles","order":1}],
		"genres":["Acción","Aventura"],
		"kind":1,
		"lastWatchedAt":1710000000123,
		"premieredAt":null,
		"createdAt":1500000000000,
		"deletedAt":null,
		"cover":{"type":"url","path":"C:/images/rurouni.jpg"},
		"sourceUrl":"Netflix",
		"folder":"C:/Anime/Rurouni",
		"studios":["Gallop","Studio Deen"],
		"origin":"manga",
		"durationMinutes":24
	}`)

	service := anime.NewQueryService(store)
	got, err := service.ListMobileAnimes(ctx)
	if err != nil {
		t.Fatalf("list mobile animes: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 anime, got %d", len(got))
	}

	assertNormalizedMobileAnime(t, got[0])
}

// assertNormalizedMobileAnime verifies the normalized mobile anime projection.
func assertNormalizedMobileAnime(t *testing.T, item contracts.MobileAnime) {
	t.Helper()
	valid := item.ID == "anime-1" && item.Active == 1 && item.FirstCycle == 0 && item.Cover != nil && *item.Cover == "C:/images/rurouni.jpg" && item.Studios != nil && *item.Studios == "Gallop, Studio Deen" && item.LastWatchedAt != nil && *item.LastWatchedAt == 1710000000123 && item.CreatedAt != nil && *item.CreatedAt == 1500000000000 && reflect.DeepEqual(item.Days, []contracts.MobileAnimeDay{{Day: "Miércoles", Order: 1}}) && reflect.DeepEqual(item.Genres, []string{"Acción", "Aventura"})
	if !valid {
		t.Fatalf("unexpected normalized anime: %#v", item)
	}
}

func TestQueryServiceListMobileAnimesEchoesModifiedAtToken(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Samurai X","episodesWatched":1}`, 1710000000123)

	service := anime.NewQueryService(store)
	got, err := service.ListMobileAnimes(ctx)
	if err != nil {
		t.Fatalf("list mobile animes: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 anime, got %d", len(got))
	}
	if got[0].ModifiedAt != 1710000000123 {
		t.Fatalf("expected modified_at 1710000000123, got %d", got[0].ModifiedAt)
	}
}

func TestQueryServiceGetMobileAnimeEchoesModifiedAtToken(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"id":"anime-1","name":"Samurai X","episodesWatched":1}`, 1710000000123)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got.ModifiedAt != 1710000000123 {
		t.Fatalf("expected modified_at 1710000000123, got %d", got.ModifiedAt)
	}
}

func TestQueryServiceGetAnimeDetailReturnsSharedDesktopReadModel(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-detail", `{
		"id":"anime-detail",
		"name":"Frieren",
		"status":0,
		"episodesWatched":10.5,
		"totalEpisodes":28,
		"active":true,
		"firstCycle":false,
		"days":[{"day":"Viernes","order":2},{"day":"Sábado","order":1}],
		"genres":["Aventura","Drama"],
		"kind":1,
		"lastWatchedAt":1710000000123,
		"premieredAt":1700000000000,
		"createdAt":1600000000000,
		"deletedAt":null,
		"cover":{"type":"url","path":"C:/images/frieren.jpg"},
		"sourceUrl":"https://anime.example/frieren",
		"folder":"C:/Anime/Frieren",
		"studios":["Madhouse"],
		"origin":"manga",
		"durationMinutes":24
	}`, 1711111111000)

	service := anime.NewQueryService(store)
	got, err := service.GetAnimeDetail(ctx, "anime-detail")
	if err != nil {
		t.Fatalf("get anime detail: %v", err)
	}
	assertAnimeDetailIdentity(t, *got)
	assertAnimeDetailProgress(t, got.Progress)
	wantDays := []contracts.MobileAnimeDay{{Day: "Viernes", Order: 2}, {Day: "Sábado", Order: 1}}
	if !reflect.DeepEqual(got.Schedule, wantDays) {
		t.Fatalf("expected schedule %#v, got %#v", wantDays, got.Schedule)
	}
	assertAnimeDetailMetadata(t, *got)
	if got.ModifiedAt != 1711111111000 {
		t.Fatalf("expected modified_at 1711111111000, got %d", got.ModifiedAt)
	}
}

// assertAnimeDetailIdentity verifies identity fields in an anime detail.
func assertAnimeDetailIdentity(t *testing.T, got contracts.AnimeDetail) {
	t.Helper()
	if got.ID != "anime-detail" || got.Name != "Frieren" {
		t.Fatalf("unexpected identity fields: %#v", got)
	}
	if got.Status != 0 || got.Active != 1 || got.FirstCycle != 0 {
		t.Fatalf("unexpected state flags: %#v", got)
	}
}

// assertAnimeDetailProgress verifies progress fields in an anime detail.
func assertAnimeDetailProgress(t *testing.T, progress contracts.AnimeDetailProgress) {
	t.Helper()
	if progress.Watched != 10.5 || progress.Total == nil || *progress.Total != 28 {
		t.Fatalf("unexpected progress: %#v", progress)
	}
	if progress.Remaining == nil || *progress.Remaining != 17.5 {
		t.Fatalf("expected remaining 17.5, got %#v", progress.Remaining)
	}
}

// assertAnimeDetailMetadata verifies metadata fields in an anime detail.
func assertAnimeDetailMetadata(t *testing.T, got contracts.AnimeDetail) {
	t.Helper()
	if got.Dates.LastWatched == nil || *got.Dates.LastWatched != 1710000000123 {
		t.Fatalf("unexpected dates: %#v", got.Dates)
	}
	if got.Content.Cover == nil || *got.Content.Cover != "C:/images/frieren.jpg" {
		t.Fatalf("unexpected content metadata: %#v", got.Content)
	}
	if got.Content.Studios == nil || *got.Content.Studios != "Madhouse" {
		t.Fatalf("unexpected studios metadata: %#v", got.Content.Studios)
	}
	if got.Download.Page == nil || *got.Download.Page != "https://anime.example/frieren" {
		t.Fatalf("unexpected download metadata: %#v", got.Download)
	}
}

func TestQueryServiceGetMobileAnimeFallsBackToLegacyDiaOrdenAndAbsentBooleans(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-legacy", `{
		"id":"anime-legacy",
		"name":"Legacy",
		"status":0,
		"episodesWatched":1,
		"day":"Lunes",
		"order":3,
		"genres":"",
		"cover":{"type":"url","path":""}
	}`)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-legacy")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected anime, got nil")
	}
	if got.Active != 0 {
		t.Fatalf("expected absent activo to normalize to 0, got %d", got.Active)
	}
	if got.FirstCycle != 0 {
		t.Fatalf("expected absent primeravez to normalize to 0, got %d", got.FirstCycle)
	}
	wantDias := []contracts.MobileAnimeDay{{Day: "Lunes", Order: 3}}
	if !reflect.DeepEqual(got.Days, wantDias) {
		t.Fatalf("expected dias %#v, got %#v", wantDias, got.Days)
	}
	if got.Genres == nil || len(got.Genres) != 0 {
		t.Fatalf("expected non-nil empty generos, got %#v", got.Genres)
	}
	payload, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal mobile anime: %v", err)
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(payload, &wire); err != nil {
		t.Fatalf("decode mobile anime JSON: %v", err)
	}
	if string(wire["genres"]) != "[]" {
		t.Fatalf("expected genres JSON array, got %s", wire["genres"])
	}
	if got.Cover == nil || *got.Cover != "" {
		t.Fatalf("expected portada empty string, got %#v", got.Cover)
	}
}

func TestQueryServiceGetMobileAnimeProjectsRepetirTimeline(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-repeated", `{
		"id":"anime-repeated",
		"name":"Repeated Anime",
		"episodesWatched":1,
		"repetitions":[{
			"numRepetitions":0,
			"episodesWatched":1,
			"status":2,
			"createdAt":1610685499207,
			"repeatedAt":1618271545221
		}]
	}`)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-repeated")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected anime, got nil")
	}
	if len(got.Repetitions) != 1 {
		t.Fatalf("expected 1 repetir entry, got %d: %#v", len(got.Repetitions), got.Repetitions)
	}

	entry := got.Repetitions[0]
	if entry.NumRepetitions != 0 {
		t.Fatalf("expected numrepeticion 0, got %d", entry.NumRepetitions)
	}
	if entry.Status != 2 {
		t.Fatalf("expected estado 2, got %d", entry.Status)
	}
	if entry.CreatedAt == nil || *entry.CreatedAt != 1610685499207 {
		t.Fatalf("expected fechaCreacion 1610685499207, got %#v", entry.CreatedAt)
	}
	if entry.RepeatedAt == nil || *entry.RepeatedAt != 1618271545221 {
		t.Fatalf("expected fechaRepeticion 1618271545221, got %#v", entry.RepeatedAt)
	}
}

func TestQueryServiceGetMobileAnimeReturnsEmptyRepetirWhenAbsent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-no-repeat", `{"id":"anime-no-repeat","name":"No Repeat","episodesWatched":1}`)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-no-repeat")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected anime, got nil")
	}
	if got.Repetitions == nil {
		t.Fatal("expected non-nil empty Repetir slice, got nil")
	}
	if len(got.Repetitions) != 0 {
		t.Fatalf("expected empty Repetir slice, got %#v", got.Repetitions)
	}
}

func TestQueryServiceCatalogListsEveryActiveInactiveAndStatusRecord(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seeds := []struct {
		id      string
		payload string
		estado  int
		activo  int
	}{
		{id: "active-watching", payload: `{"id":"active-watching","name":"Active Watching","episodesWatched":5,"status":0,"active":true}`, estado: 0, activo: 1},
		{id: "active-finished", payload: `{"id":"active-finished","name":"Active Finished","episodesWatched":12,"status":1,"totalEpisodes":12,"active":true}`, estado: 1, activo: 1},
		{id: "inactive-finished", payload: `{"id":"inactive-finished","name":"Inactive Finished","episodesWatched":12,"status":1,"active":false}`, estado: 1, activo: 0},
		{id: "inactive-disliked", payload: `{"id":"inactive-disliked","name":"Inactive Disliked","episodesWatched":3,"status":2,"active":false}`, estado: 2, activo: 0},
	}
	for _, seed := range seeds {
		seedAnimeSnapshot(t, store, seed.id, seed.payload)
	}

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeItems(ctx)
	if err != nil {
		t.Fatalf("list anime items: %v", err)
	}
	if len(got) != len(seeds) {
		t.Fatalf("Catalog must list every stored record, got %d of %d", len(got), len(seeds))
	}

	byID := make(map[string]contracts.AnimeListItem, len(got))
	for _, item := range got {
		byID[item.ID] = item
	}
	for _, seed := range seeds {
		item, ok := byID[seed.id]
		if !ok {
			t.Fatalf("Catalog silently excluded %s", seed.id)
		}
		if item.Active != seed.activo || item.Status != seed.estado {
			t.Fatalf("Catalog changed %s status: got activo=%d estado=%d", seed.id, item.Active, item.Status)
		}
	}
}

func TestQueryServiceListAnimeItemsDerivesDownloadGapBooleans(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-present", `{"id":"anime-present","name":"Has Both","episodesWatched":1,"active":true,"sourceUrl":"https://jkanime.net/has-both/","folder":"C:\\anime\\has-both"}`)
	seedAnimeSnapshot(t, store, "anime-absent", `{"id":"anime-absent","name":"Has Neither","episodesWatched":1,"active":true}`)
	seedAnimeSnapshot(t, store, "anime-empty", `{"id":"anime-empty","name":"Has Empty Strings","episodesWatched":1,"active":true,"sourceUrl":"","folder":""}`)
	seedAnimeSnapshot(t, store, "anime-null", `{"id":"anime-null","name":"Has Explicit Null","episodesWatched":1,"active":true,"sourceUrl":null,"folder":null}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeItems(ctx)
	if err != nil {
		t.Fatalf("list anime items: %v", err)
	}

	byID := make(map[string]contracts.AnimeListItem)
	for _, item := range got {
		byID[item.ID] = item
	}

	assertDownloadGapFlags(t, byID)
}

// assertDownloadGapFlags verifies derived download-gap flags.
func assertDownloadGapFlags(t *testing.T, byID map[string]contracts.AnimeListItem) {
	t.Helper()
	for _, test := range []struct {
		id           string
		page, folder bool
	}{{"anime-present", true, true}, {"anime-absent", false, false}, {"anime-empty", false, false}, {"anime-null", false, false}} {
		item, ok := byID[test.id]
		if !ok || item.HasDownloadPage != test.page || item.HasFolder != test.folder {
			t.Fatalf("unexpected download gap flags for %q: %#v", test.id, item)
		}
	}
}
