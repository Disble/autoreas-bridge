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
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":4,"totalcap":12,"activo":false}`)

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
		"_id":"anime-1",
		"nombre":"Samurai X",
		"estado":2,
		"nrocapvisto":10.5,
		"totalcap":95,
		"activo":true,
		"primeravez":false,
		"dias":[{"dia":"Miércoles","orden":1}],
		"generos":["Acción","Aventura"],
		"tipo":1,
		"fechaUltCapVisto":{"$$date":1710000000123},
		"fechaEstreno":null,
		"fechaCreacion":{"$$date":1500000000000},
		"fechaEliminacion":null,
		"portada":{"type":"url","path":"C:/images/rurouni.jpg"},
		"pagina":"Netflix",
		"carpeta":"C:/Anime/Rurouni",
		"estudios":["Gallop","Studio Deen"],
		"origen":"manga",
		"duracion":24
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
	valid := item.ID == "anime-1" && item.Activo == 1 && item.PrimeraVez == 0 && item.Portada != nil && *item.Portada == "C:/images/rurouni.jpg" && item.Estudios != nil && *item.Estudios == "Gallop, Studio Deen" && item.FechaUltCapVisto != nil && *item.FechaUltCapVisto == 1710000000123 && item.FechaCreacion != nil && *item.FechaCreacion == 1500000000000 && reflect.DeepEqual(item.Dias, []contracts.MobileAnimeDay{{Dia: "Miércoles", Orden: 1}}) && reflect.DeepEqual(item.Generos, []string{"Acción", "Aventura"})
	if !valid {
		t.Fatalf("unexpected normalized anime: %#v", item)
	}
}

func TestQueryServiceListMobileAnimesEchoesModifiedAtToken(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Samurai X","nrocapvisto":1}`, 1710000000123)

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
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Samurai X","nrocapvisto":1}`, 1710000000123)

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
		"_id":"anime-detail",
		"nombre":"Frieren",
		"estado":0,
		"nrocapvisto":10.5,
		"totalcap":28,
		"activo":true,
		"primeravez":false,
		"dias":[{"dia":"Viernes","orden":2},{"dia":"Sábado","orden":1}],
		"generos":["Aventura","Drama"],
		"tipo":1,
		"fechaUltCapVisto":{"$$date":1710000000123},
		"fechaEstreno":{"$$date":1700000000000},
		"fechaCreacion":{"$$date":1600000000000},
		"fechaEliminacion":null,
		"portada":{"type":"url","path":"C:/images/frieren.jpg"},
		"pagina":"https://anime.example/frieren",
		"carpeta":"C:/Anime/Frieren",
		"estudios":["Madhouse"],
		"origen":"manga",
		"duracion":24
	}`, 1711111111000)

	service := anime.NewQueryService(store)
	got, err := service.GetAnimeDetail(ctx, "anime-detail")
	if err != nil {
		t.Fatalf("get anime detail: %v", err)
	}
	assertAnimeDetailIdentity(t, *got)
	assertAnimeDetailProgress(t, got.Progress)
	wantDays := []contracts.MobileAnimeDay{{Dia: "Viernes", Orden: 2}, {Dia: "Sábado", Orden: 1}}
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
	if got.ID != "anime-detail" || got.Nombre != "Frieren" {
		t.Fatalf("unexpected identity fields: %#v", got)
	}
	if got.Estado != 0 || got.Activo != 1 || got.PrimeraVez != 0 {
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
		"_id":"anime-legacy",
		"nombre":"Legacy",
		"estado":0,
		"nrocapvisto":1,
		"dia":"Lunes",
		"orden":3,
		"generos":"",
		"portada":{"type":"url","path":""}
	}`)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-legacy")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected anime, got nil")
	}
	if got.Activo != 0 {
		t.Fatalf("expected absent activo to normalize to 0, got %d", got.Activo)
	}
	if got.PrimeraVez != 0 {
		t.Fatalf("expected absent primeravez to normalize to 0, got %d", got.PrimeraVez)
	}
	wantDias := []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 3}}
	if !reflect.DeepEqual(got.Dias, wantDias) {
		t.Fatalf("expected dias %#v, got %#v", wantDias, got.Dias)
	}
	if got.Generos == nil || len(got.Generos) != 0 {
		t.Fatalf("expected non-nil empty generos, got %#v", got.Generos)
	}
	payload, err := json.Marshal(got)
	if err != nil {
		t.Fatalf("marshal mobile anime: %v", err)
	}
	var wire map[string]json.RawMessage
	if err := json.Unmarshal(payload, &wire); err != nil {
		t.Fatalf("decode mobile anime JSON: %v", err)
	}
	if string(wire["generos"]) != "[]" {
		t.Fatalf("expected generos JSON array, got %s", wire["generos"])
	}
	if got.Portada == nil || *got.Portada != "" {
		t.Fatalf("expected portada empty string, got %#v", got.Portada)
	}
}

func TestQueryServiceGetMobileAnimeProjectsRepetirTimeline(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-repeated", `{
		"_id":"anime-repeated",
		"nombre":"Repeated Anime",
		"nrocapvisto":1,
		"repetir":[{
			"numrepeticion":0,
			"nrocapvisto":1,
			"estado":2,
			"fechaCreacion":{"$$date":1610685499207},
			"fechaRepeticion":{"$$date":1618271545221}
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
	if len(got.Repetir) != 1 {
		t.Fatalf("expected 1 repetir entry, got %d: %#v", len(got.Repetir), got.Repetir)
	}

	entry := got.Repetir[0]
	if entry.NumRepeticion != 0 {
		t.Fatalf("expected numrepeticion 0, got %d", entry.NumRepeticion)
	}
	if entry.Estado != 2 {
		t.Fatalf("expected estado 2, got %d", entry.Estado)
	}
	if entry.FechaCreacion == nil || *entry.FechaCreacion != 1610685499207 {
		t.Fatalf("expected fechaCreacion 1610685499207, got %#v", entry.FechaCreacion)
	}
	if entry.FechaRepeticion == nil || *entry.FechaRepeticion != 1618271545221 {
		t.Fatalf("expected fechaRepeticion 1618271545221, got %#v", entry.FechaRepeticion)
	}
}

func TestQueryServiceGetMobileAnimeReturnsEmptyRepetirWhenAbsent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-no-repeat", `{"_id":"anime-no-repeat","nombre":"No Repeat","nrocapvisto":1}`)

	service := anime.NewQueryService(store)
	got, err := service.GetMobileAnime(ctx, "anime-no-repeat")
	if err != nil {
		t.Fatalf("get mobile anime: %v", err)
	}
	if got == nil {
		t.Fatal("expected anime, got nil")
	}
	if got.Repetir == nil {
		t.Fatal("expected non-nil empty Repetir slice, got nil")
	}
	if len(got.Repetir) != 0 {
		t.Fatalf("expected empty Repetir slice, got %#v", got.Repetir)
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
		{id: "active-watching", payload: `{"_id":"active-watching","nombre":"Active Watching","nrocapvisto":5,"estado":0,"activo":true}`, estado: 0, activo: 1},
		{id: "active-finished", payload: `{"_id":"active-finished","nombre":"Active Finished","nrocapvisto":12,"estado":1,"totalcap":12,"activo":true}`, estado: 1, activo: 1},
		{id: "inactive-finished", payload: `{"_id":"inactive-finished","nombre":"Inactive Finished","nrocapvisto":12,"estado":1,"activo":false}`, estado: 1, activo: 0},
		{id: "inactive-disliked", payload: `{"_id":"inactive-disliked","nombre":"Inactive Disliked","nrocapvisto":3,"estado":2,"activo":false}`, estado: 2, activo: 0},
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
		if item.Activo != seed.activo || item.Estado != seed.estado {
			t.Fatalf("Catalog changed %s status: got activo=%d estado=%d", seed.id, item.Activo, item.Estado)
		}
	}
}

func TestQueryServiceListAnimeItemsDerivesDownloadGapBooleans(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-present", `{"_id":"anime-present","nombre":"Has Both","nrocapvisto":1,"activo":true,"pagina":"https://jkanime.net/has-both/","carpeta":"C:\\anime\\has-both"}`)
	seedAnimeSnapshot(t, store, "anime-absent", `{"_id":"anime-absent","nombre":"Has Neither","nrocapvisto":1,"activo":true}`)
	seedAnimeSnapshot(t, store, "anime-empty", `{"_id":"anime-empty","nombre":"Has Empty Strings","nrocapvisto":1,"activo":true,"pagina":"","carpeta":""}`)
	seedAnimeSnapshot(t, store, "anime-null", `{"_id":"anime-null","nombre":"Has Explicit Null","nrocapvisto":1,"activo":true,"pagina":null,"carpeta":null}`)

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
