package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
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

// TestQueryServiceListAnimeItemsDerivesDownloadGapBooleans covers download-orchestration
// spec "Missing Pagina/Carpeta Surfaced as Actionable State" (UI retrievability half):
// AnimeListItem.HasDownloadPage/HasFolder must be derivable read-only by the desktop
// AnimePanel without exposing the raw Pagina/Carpeta strings.
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

	null, ok := byID["anime-null"]
	if !ok {
		t.Fatal("expected anime-null in results")
	}
	if null.HasDownloadPage {
		t.Fatal("expected HasDownloadPage false when pagina is explicit null")
	}
	if null.HasFolder {
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

func TestWriteServicePatchAnimePublishesMergedSnapshotWithFractionalProgress(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true,"pagina":"netflix"}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(10.5)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	if writer.animeID != "anime-1" {
		t.Fatalf("expected anime id %q, got %q", "anime-1", writer.animeID)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}

	if raw.Nombre != "Cowboy Bebop" {
		t.Fatalf("expected nombre to be preserved, got %q", raw.Nombre)
	}

	if raw.NroCapVisto != 10.5 {
		t.Fatalf("expected nrocapvisto 10.5, got %v", raw.NroCapVisto)
	}

	if raw.EstadoValue() == nil || *raw.EstadoValue() != 2 {
		t.Fatalf("expected estado 2 to be preserved, got %#v", raw.EstadoValue())
	}

	stampedAt := raw.FechaUltCapVisto.Time()
	if stampedAt == nil || stampedAt.UnixMilli() != 1710000000123 {
		t.Fatalf("expected stamped timestamp 1710000000123, got %v", stampedAt)
	}
}

func TestWriteServicePatchAnimeForcesEstadoFinalizado(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":11,"estado":2,"totalcap":12}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000456).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(12)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}

	if raw.EstadoValue() == nil || *raw.EstadoValue() != 1 {
		t.Fatalf("expected forced estado 1, got %#v", raw.EstadoValue())
	}
}

func TestWriteServicePatchAnimeUsesClientFechaUltCapVistoWhenProvided(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000999).UTC() })

	clientTs := int64(1710000000123)
	patch := api.AnimePatch{NroCapVisto: floatPtr(664), FechaUltCapVisto: &clientTs}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}

	stampedAt := raw.FechaUltCapVisto.Time()
	if stampedAt == nil || stampedAt.UnixMilli() != clientTs {
		t.Fatalf("expected client fechaUltCapVisto %d, got %v", clientTs, stampedAt)
	}
}

func TestWriteServicePatchAnimeReturnsWriterError(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2}`)

	wantErr := errors.New("append failed")
	writer := &stubAnimeWriter{err: wantErr}
	service := anime.NewWriteService(store, writer)

	err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(3)})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected writer error %v, got %v", wantErr, err)
	}
}

func TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12,"dias":[{"dia":"Lunes","orden":1}]}`)

	writer := &capturingAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5)}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	if len(writer.payloads) != 1 {
		t.Fatalf("expected 1 payload after first write, got %d", len(writer.payloads))
	}
	updateAnimeSnapshot(t, store, "anime-1", writer.payloads[0])

	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}}); err != nil {
		t.Fatalf("second patch anime: %v", err)
	}
	if len(writer.payloads) != 2 {
		t.Fatalf("expected 2 payloads after second write, got %d", len(writer.payloads))
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payloads[1], &raw); err != nil {
		t.Fatalf("unmarshal second writer payload: %v", err)
	}
	if raw.NroCapVisto != 5 {
		t.Fatalf("expected second write to preserve nrocapvisto 5, got %v", raw.NroCapVisto)
	}
	wantDias := []string{"Martes", "Miercoles"}
	if !reflect.DeepEqual(raw.DiasStrings(), wantDias) {
		t.Fatalf("expected dias %#v, got %#v", wantDias, raw.DiasStrings())
	}
}

func openAnimeServiceTestStore(t *testing.T) *bridgeSync.AnimeSnapshotStore {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return bridgeSync.NewAnimeSnapshotStore(db)
}

func seedAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()

	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}

	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot: %v", err)
	}
}

func floatPtr(value float64) *float64 {
	return &value
}

type stubAnimeWriter struct {
	animeID string
	payload []byte
	err     error
}

func (s *stubAnimeWriter) RequestWrite(_ context.Context, animeID string, payload []byte) error {
	s.animeID = animeID
	s.payload = append([]byte(nil), payload...)
	return s.err
}

type capturingAnimeWriter struct {
	payloads [][]byte
	err      error
}

func (w *capturingAnimeWriter) RequestWrite(_ context.Context, _ string, payload []byte) error {
	w.payloads = append(w.payloads, append([]byte(nil), payload...))
	return w.err
}

func updateAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload []byte) {
	t.Helper()
	records, err := store.ListSnapshots(context.Background())
	if err != nil {
		t.Fatalf("list snapshots: %v", err)
	}
	records[animeID] = anime.SnapshotRecord{
		AnimeID:       animeID,
		CanonicalJSON: append([]byte(nil), payload...),
		Hash:          anime.HashSnapshot(payload),
	}
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("replace snapshot baseline: %v", err)
	}
}
