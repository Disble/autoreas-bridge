package anime_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
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

	animeItem := got[0]
	if animeItem.ID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", animeItem.ID)
	}
	if animeItem.Activo != 1 {
		t.Fatalf("expected activo 1, got %d", animeItem.Activo)
	}
	if animeItem.PrimeraVez != 0 {
		t.Fatalf("expected primeravez 0, got %d", animeItem.PrimeraVez)
	}
	if animeItem.Portada == nil || *animeItem.Portada != "C:/images/rurouni.jpg" {
		t.Fatalf("expected portada path, got %#v", animeItem.Portada)
	}
	if animeItem.Estudios == nil || *animeItem.Estudios != "Gallop, Studio Deen" {
		t.Fatalf("expected estudios joined string, got %#v", animeItem.Estudios)
	}
	if animeItem.FechaUltCapVisto == nil || *animeItem.FechaUltCapVisto != 1710000000123 {
		t.Fatalf("expected fechaUltCapVisto 1710000000123, got %#v", animeItem.FechaUltCapVisto)
	}
	if animeItem.FechaCreacion == nil || *animeItem.FechaCreacion != 1500000000000 {
		t.Fatalf("expected fechaCreacion 1500000000000, got %#v", animeItem.FechaCreacion)
	}
	wantDias := []contracts.MobileAnimeDay{{Dia: "Miércoles", Orden: 1}}
	if !reflect.DeepEqual(animeItem.Dias, wantDias) {
		t.Fatalf("expected dias %#v, got %#v", wantDias, animeItem.Dias)
	}
	wantGeneros := []string{"Acción", "Aventura"}
	if !reflect.DeepEqual(animeItem.Generos, wantGeneros) {
		t.Fatalf("expected generos %#v, got %#v", wantGeneros, animeItem.Generos)
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
	if len(got.Generos) != 0 {
		t.Fatalf("expected empty generos, got %#v", got.Generos)
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

func TestQueryServiceListAnimeItemsReturnsActiveAndInactive(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-active", `{"_id":"anime-active","nombre":"Active Anime","nrocapvisto":5,"estado":2,"totalcap":12,"activo":true}`)
	seedAnimeSnapshot(t, store, "anime-inactive", `{"_id":"anime-inactive","nombre":"Inactive Anime","nrocapvisto":3,"estado":0,"activo":false}`)

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeItems(ctx)
	if err != nil {
		t.Fatalf("list anime items: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 anime items, got %d", len(got))
	}

	byID := make(map[string]contracts.AnimeListItem)
	for _, item := range got {
		byID[item.ID] = item
	}

	active, ok := byID["anime-active"]
	if !ok {
		t.Fatal("expected anime-active in results")
	}
	if active.Activo != 1 {
		t.Fatalf("expected active activo 1, got %d", active.Activo)
	}
	if active.TotalCap == nil || *active.TotalCap != 12 {
		t.Fatalf("expected totalcap 12, got %#v", active.TotalCap)
	}

	inactive, ok := byID["anime-inactive"]
	if !ok {
		t.Fatal("expected anime-inactive in results")
	}
	if inactive.Activo != 0 {
		t.Fatalf("expected inactive activo 0, got %d", inactive.Activo)
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

	present, ok := byID["anime-present"]
	if !ok {
		t.Fatal("expected anime-present in results")
	}
	if !present.HasDownloadPage {
		t.Fatal("expected HasDownloadPage true when pagina is a non-empty string")
	}
	if !present.HasFolder {
		t.Fatal("expected HasFolder true when carpeta is a non-empty string")
	}

	absent, ok := byID["anime-absent"]
	if !ok {
		t.Fatal("expected anime-absent in results")
	}
	if absent.HasDownloadPage {
		t.Fatal("expected HasDownloadPage false when pagina is absent from the raw payload")
	}
	if absent.HasFolder {
		t.Fatal("expected HasFolder false when carpeta is absent from the raw payload")
	}

	empty, ok := byID["anime-empty"]
	if !ok {
		t.Fatal("expected anime-empty in results")
	}
	if empty.HasDownloadPage {
		t.Fatal("expected HasDownloadPage false when pagina is an empty string")
	}
	if empty.HasFolder {
		t.Fatal("expected HasFolder false when carpeta is an empty string")
	}

	nullItem, ok := byID["anime-null"]
	if !ok {
		t.Fatal("expected anime-null in results")
	}
	if nullItem.HasDownloadPage {
		t.Fatal("expected HasDownloadPage false when pagina is explicit null")
	}
	if nullItem.HasFolder {
		t.Fatal("expected HasFolder false when carpeta is explicit null")
	}
}

func TestQueryServiceGetEffectiveAnimeReturnsNotFoundForZombie(t *testing.T) {
	service := anime.NewQueryService(openAnimeServiceTestStore(t))
	_, err := service.GetEffectiveAnime(context.Background(), "zombie-1")
	if !errors.Is(err, api.ErrAnimeNotFound) {
		t.Fatalf("expected ErrAnimeNotFound, got %v", err)
	}
}
