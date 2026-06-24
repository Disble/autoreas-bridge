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
	"autoreas-bridge/internal/notification"
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

// TestQueryServiceListMobileAnimesEchoesModifiedAtToken covers SDD-30
// ADR-30-5: MobileAnime.ModifiedAt echoes the bridge-private OCC token
// (SnapshotRecord.ModifiedAt) so the mobile client can round-trip it back as
// AnimePatch.Base on its next write. Pre-migration rows (ModifiedAt==0) echo
// 0, which is itself a legitimate base value (fast-forward path).
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

	// base:0 matches seedAnimeSnapshot's default ModifiedAt -- fast-forward.
	patch := api.AnimePatch{NroCapVisto: floatPtr(10.5), Base: int64Ptr(0)}
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

	// base:0 matches seedAnimeSnapshot's default ModifiedAt -- fast-forward.
	patch := api.AnimePatch{NroCapVisto: floatPtr(12), Base: int64Ptr(0)}
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

	// base:0 matches seedAnimeSnapshot's default ModifiedAt -- fast-forward.
	clientTs := int64(1710000000123)
	patch := api.AnimePatch{NroCapVisto: floatPtr(664), FechaUltCapVisto: &clientTs, Base: int64Ptr(0)}
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

	// base:0 matches seedAnimeSnapshot's default ModifiedAt -- fast-forward
	// (must reach the writer to surface its error).
	err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(3), Base: int64Ptr(0)})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected writer error %v, got %v", wantErr, err)
	}
}

// TestWriteServicePatchAnimeStampsModifiedAtOnConfirmedSnapshot covers SDD-30
// ADR-30-1/§3: updateConfirmedSnapshot must stamp a fresh, strictly-monotonic
// modified_at token (never zero/unset) via stampModifiedAt(prevRecord.ModifiedAt, s.now)
// every time a write is confirmed.
func TestWriteServicePatchAnimeStampsModifiedAtOnConfirmedSnapshot(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	// base:1000 matches the seeded ModifiedAt -- fast-forward.
	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected confirmed snapshot ModifiedAt to advance past previous 1000, got %d", got.ModifiedAt)
	}
}

func TestWriteServicePatchAnimeUsesLatestConfirmedStateAcrossSequentialWrites(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12,"dias":[{"dia":"Lunes","orden":1}]}`)

	writer := &capturingAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	// base:0 matches seedAnimeSnapshot's default ModifiedAt -- fast-forward.
	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(0)}); err != nil {
		t.Fatalf("first patch anime: %v", err)
	}
	if len(writer.payloads) != 1 {
		t.Fatalf("expected 1 payload after first write, got %d", len(writer.payloads))
	}
	updateAnimeSnapshot(t, store, "anime-1", writer.payloads[0])

	// updateAnimeSnapshot persists the new state with ModifiedAt left at its
	// zero value (it does not call stampModifiedAt), so base:0 again matches.
	if err := service.PatchAnime(ctx, "anime-1", api.AnimePatch{Dias: []string{"Martes", "Miercoles"}, Base: int64Ptr(0)}); err != nil {
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

// TestWriteServicePatchAnimeFastForwardsWhenBaseMatchesCurrent covers SDD-30
// ADR-30-2's first gate branch: base == current.ModifiedAt applies the patch
// and stamps a fresh token, exactly like the no-base legacy path -- no
// conflict, no divergence handling.
func TestWriteServicePatchAnimeFastForwardsWhenBaseMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(1000)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("patch anime: %v", err)
	}

	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call for fast-forward, got %d", writer.calls)
	}

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(writer.payload, &raw); err != nil {
		t.Fatalf("unmarshal writer payload: %v", err)
	}
	if raw.NroCapVisto != 5 {
		t.Fatalf("expected applied nrocapvisto 5, got %v", raw.NroCapVisto)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 1000 {
		t.Fatalf("expected ModifiedAt to advance past base 1000, got %d", got.ModifiedAt)
	}
}

// TestWriteServicePatchAnimeDoesNotClobberOnDivergentBase covers SDD-30
// ADR-30-2's divergence branch: base != current.ModifiedAt AND the desired
// value differs from current -> the write returns SUCCESS (non-blocking) but
// must NOT clobber the current snapshot: no RequestWrite call, no baseline
// mutation for the divergent value.
func TestWriteServicePatchAnimeDoesNotClobberOnDivergentBase(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	// Stale base (999 != 1000) AND a genuinely different desired value (7 != 2).
	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on divergence, got error: %v", err)
	}

	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on divergence (must not clobber), got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to remain 1000 (not clobbered), got %d", got.ModifiedAt)
	}
	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(got.CanonicalJSON, &raw); err != nil {
		t.Fatalf("unmarshal current snapshot: %v", err)
	}
	if raw.NroCapVisto != 2 {
		t.Fatalf("expected current snapshot nrocapvisto to remain 2 (not clobbered), got %v", raw.NroCapVisto)
	}
}

// TestWriteServicePatchAnimeNoOpsWhenDesiredValueAlreadyMatchesCurrent covers
// SDD-30 ADR-30-2/§4298 item 3: a blind retry whose desired value already
// equals current (canonical JSON comparison) is a no-op success -- no write,
// no stamp -- even though the supplied base is stale/divergent.
func TestWriteServicePatchAnimeNoOpsWhenDesiredValueAlreadyMatchesCurrent(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":5,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	// Stale base (999 != 1000) but the desired nrocapvisto (5) already equals
	// the current value -> idempotency guard, NOT a divergence.
	patch := api.AnimePatch{NroCapVisto: floatPtr(5), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected no-op success, got error: %v", err)
	}

	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls for no-op idempotent retry, got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected ModifiedAt to remain unstamped at 1000 for a no-op, got %d", got.ModifiedAt)
	}
}

// TestWriteServicePatchAnimeCreatesWhenBaseNilAndRecordIsNew covers SDD-30
// ADR-30-2's create branch: base=nil with NO existing record is a legitimate
// create -> apply + stamp, no conflict.
func TestWriteServicePatchAnimeCreatesWhenBaseNilAndRecordIsNew(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	// No seed: "anime-new" does not exist yet.

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(1)}
	if err := service.PatchAnime(ctx, "anime-new", patch); err != nil {
		t.Fatalf("expected create to succeed, got error: %v", err)
	}

	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call for create, got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-new")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt <= 0 {
		t.Fatalf("expected create to stamp a positive ModifiedAt, got %d", got.ModifiedAt)
	}
}

// TestWriteServicePatchAnimeSafePathWhenBaseNilButRecordExists covers SDD-30
// ADR-30-2's "old client" safe path: base=nil but the record ALREADY exists
// and the desired value differs -> treated like a divergence (non-blocking
// success, current snapshot NOT clobbered) -- never a silent overwrite.
func TestWriteServicePatchAnimeSafePathWhenBaseNilButRecordExists(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	// Old client: no base sent at all, but the record already exists and the
	// desired value (9) differs from current (2).
	patch := api.AnimePatch{NroCapVisto: floatPtr(9)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on old-client safe path, got error: %v", err)
	}

	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on old-client safe path (must not silently overwrite), got %d", writer.calls)
	}

	got, err := store.GetSnapshot(ctx, "anime-1")
	if err != nil {
		t.Fatalf("get snapshot: %v", err)
	}
	if got.ModifiedAt != 1000 {
		t.Fatalf("expected current snapshot ModifiedAt to remain 1000 (not clobbered), got %d", got.ModifiedAt)
	}
	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal(got.CanonicalJSON, &raw); err != nil {
		t.Fatalf("unmarshal current snapshot: %v", err)
	}
	if raw.NroCapVisto != 2 {
		t.Fatalf("expected current snapshot nrocapvisto to remain 2 (not clobbered), got %v", raw.NroCapVisto)
	}
}

// TestWriteServicePatchAnimeDefaultDepsAreNilSafeNoOps covers SDD-30 ADR-30-4:
// a WriteService constructed via NewWriteService(store, writer) (no deps set)
// must keep behaving exactly as before Phase 4 -- divergence still returns
// success, just without any conflict/notify side effect.
func TestWriteServicePatchAnimeDefaultDepsAreNilSafeNoOps(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	patch := api.AnimePatch{NroCapVisto: floatPtr(9), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success with nil deps, got error: %v", err)
	}
}

// TestWriteServicePatchAnimeDivergenceInsertsConflictAndNotifies covers
// SDD-30 ADR-30-4: on divergence, InsertConflict is called once with
// Local=current snapshot, Remote=desired snapshot, and Notify is called once
// with Source:"sync", Level:warning -- in that order (INSERT before Notify).
func TestWriteServicePatchAnimeDivergenceInsertsConflictAndNotifies(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	currentJSON := `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", currentJSON, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected non-blocking success on divergence, got error: %v", err)
	}

	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected 1 InsertConflict call, got %d", len(conflicts.inserted))
	}
	gotRecord := conflicts.inserted[0]
	if gotRecord.AnimeID != "anime-1" {
		t.Fatalf("expected conflict anime id %q, got %q", "anime-1", gotRecord.AnimeID)
	}
	if !jsonValueEqual(t, gotRecord.LocalSnapshotJSON, []byte(currentJSON)) {
		t.Fatalf("expected local snapshot %s, got %s", currentJSON, gotRecord.LocalSnapshotJSON)
	}
	var remote domain.LegacyAnimeRaw
	if err := json.Unmarshal(gotRecord.RemoteSnapshotJSON, &remote); err != nil {
		t.Fatalf("unmarshal remote snapshot: %v", err)
	}
	if remote.NroCapVisto != 7 {
		t.Fatalf("expected remote snapshot nrocapvisto 7, got %v", remote.NroCapVisto)
	}

	if len(notifier.notifications) != 1 {
		t.Fatalf("expected 1 Notify call, got %d", len(notifier.notifications))
	}
	gotNotification := notifier.notifications[0]
	if gotNotification.Source != "sync" {
		t.Fatalf("expected notification source %q, got %q", "sync", gotNotification.Source)
	}
	if gotNotification.Level != notification.LevelWarning {
		t.Fatalf("expected notification level %q, got %q", notification.LevelWarning, gotNotification.Level)
	}

	if writer.calls != 0 {
		t.Fatalf("expected 0 RequestWrite calls on divergence, got %d", writer.calls)
	}
}

// TestWriteServicePatchAnimeIsolatesConflictWriterFailure covers the
// MANDATORY failure-isolation rule (design.md section 4): InsertConflict
// erroring must NOT fail or block the write -- PatchAnime still returns
// success to the caller.
func TestWriteServicePatchAnimeIsolatesConflictWriterFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{err: errors.New("insert failed")}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success despite conflict writer failure, got error: %v", err)
	}
}

// TestWriteServicePatchAnimeIsolatesNotifierFailure covers the same
// failure-isolation rule for the Notifier: Notify erroring must NOT fail or
// block the write either.
func TestWriteServicePatchAnimeIsolatesNotifierFailure(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{err: errors.New("notify failed")}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success despite notifier failure, got error: %v", err)
	}
	if len(conflicts.inserted) != 1 {
		t.Fatalf("expected InsertConflict to still be called once, got %d", len(conflicts.inserted))
	}
}

// TestWriteServicePatchAnimeObserveOnlyAppliesLastCallWinsWithoutConflict
// covers the OCCObserveOnly staged-rollout lever (design.md section 6): when
// true, a divergence is logged-only -- applies last-call-wins (writer is
// called, snapshot is clobbered) and does NOT call InsertConflict/Notify.
func TestWriteServicePatchAnimeObserveOnlyAppliesLastCallWinsWithoutConflict(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-1", `{"_id":"anime-1","nombre":"Test","nrocapvisto":2,"estado":2,"totalcap":12}`, 1000)

	writer := &stubAnimeWriter{}
	conflicts := &stubConflictWriter{}
	notifier := &stubNotifier{}
	service := anime.NewWriteService(store, writer)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	service.SetDeps(anime.WriteServiceDeps{Conflicts: conflicts, Notifier: notifier, OCCObserveOnly: true})

	patch := api.AnimePatch{NroCapVisto: floatPtr(7), Base: int64Ptr(999)}
	if err := service.PatchAnime(ctx, "anime-1", patch); err != nil {
		t.Fatalf("expected success in observe-only mode, got error: %v", err)
	}

	if writer.calls != 1 {
		t.Fatalf("expected 1 RequestWrite call (last-call-wins) in observe-only mode, got %d", writer.calls)
	}
	if len(conflicts.inserted) != 0 {
		t.Fatalf("expected 0 InsertConflict calls in observe-only mode, got %d", len(conflicts.inserted))
	}
	if len(notifier.notifications) != 0 {
		t.Fatalf("expected 0 Notify calls in observe-only mode, got %d", len(notifier.notifications))
	}
}

func jsonValueEqual(t *testing.T, got, want []byte) bool {
	t.Helper()
	var gotValue, wantValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("unmarshal got json: %v", err)
	}
	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Fatalf("unmarshal want json: %v", err)
	}
	return reflect.DeepEqual(gotValue, wantValue)
}

type stubConflictWriter struct {
	inserted []contracts.ConflictRecord
	err      error
}

func (s *stubConflictWriter) InsertConflict(_ context.Context, record contracts.ConflictRecord) error {
	s.inserted = append(s.inserted, record)
	return s.err
}

type stubNotifier struct {
	notifications []notification.Notification
	err           error
}

func (s *stubNotifier) Notify(_ context.Context, n notification.Notification) error {
	s.notifications = append(s.notifications, n)
	return s.err
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

func seedAnimeSnapshotWithModifiedAt(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string, modifiedAt int64) {
	t.Helper()

	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
			ModifiedAt:    modifiedAt,
		},
	}

	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot with modified_at: %v", err)
	}
}

func floatPtr(value float64) *float64 {
	return &value
}

func int64Ptr(value int64) *int64 {
	return &value
}

type stubAnimeWriter struct {
	animeID string
	payload []byte
	err     error
	calls   int
}

func (s *stubAnimeWriter) RequestWrite(_ context.Context, animeID string, payload []byte) error {
	s.calls++
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
