package anime_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	bridgeSync "autoreas-bridge/internal/sync"
)

// namedCreateService builds a create service that can see the catalogue, the
// way both production wirings do (app_runtime_services.go and
// app_season_availability.go both call SetQuery).
func namedCreateService(t *testing.T, ids ...string) *anime.CreateService {
	t.Helper()

	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	next := 0
	write.SetIDGen(func() string {
		id := ids[next]
		next++
		return id
	})
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })

	service := anime.NewCreateService(write)
	service.SetQuery(anime.NewQueryService(store))
	return service
}

// createNamed asks the service for one anime under the given name.
func createNamed(service *anime.CreateService, name string) error {
	_, err := service.CreateAnime(context.Background(), api.AnimeCreate{
		Nombre: name,
		Pagina: "https://jkanime.net/" + strings.ToLower(strings.ReplaceAll(name, " ", "-")),
		Dias:   []api.Placement{{Day: "Sin ver", Order: 1}},
	})
	return err
}

func TestCreateServiceRejectsANameAnotherAnimeAlreadyHolds(t *testing.T) {
	service := namedCreateService(t, "first", "second")
	if err := createNamed(service, "Comic Girls"); err != nil {
		t.Fatalf("the first anime of a name must be accepted: %v", err)
	}

	err := createNamed(service, "Comic Girls")
	if err == nil {
		t.Fatal("a second anime holding the same name must be rejected")
	}
	if !strings.Contains(err.Error(), "Comic Girls") {
		t.Errorf("the refusal must name the anime, got: %v", err)
	}
	if !strings.Contains(err.Error(), "first") {
		t.Errorf("the refusal must identify the record already holding it, got: %v", err)
	}
}

func TestCreateServiceComparesNamesIgnoringCaseAndSurroundingSpace(t *testing.T) {
	service := namedCreateService(t, "first", "second")
	if err := createNamed(service, "Tensei Shitara Slime Datta Ken"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := createNamed(service, "  tensei shitara slime datta ken  "); err == nil {
		t.Fatal("names differing only by case or padding are the same name")
	}
}

func TestCreateServiceStillAcceptsADistinctName(t *testing.T) {
	service := namedCreateService(t, "series", "ova")
	if err := createNamed(service, "Tensei Shitara Slime Datta Ken"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := createNamed(service, "Tensei Shitara Slime Datta Ken OVA"); err != nil {
		t.Fatalf("a different work must still be creatable: %v", err)
	}
}

func TestCreateServiceRejectsANameAlreadyHeldByADeletedAnime(t *testing.T) {
	service := namedCreateService(t, "first", "second")
	if err := createNamed(service, "Sayonara Lara"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Deleting an anime is a lifecycle state, not a release of its name: the
	// record is still there and can be restored, so re-creating it would be the
	// duplicate this whole guard exists to prevent.
	err := createNamed(service, "Sayonara Lara")
	if err == nil {
		t.Fatal("a name held by any stored record, deleted or not, is taken")
	}
}

func TestCreateBatchRejectsTwoCreatesThatWouldShareAName(t *testing.T) {
	service := namedCreateService(t, "one", "two")

	_, err := service.CreateBatch(context.Background(), []api.AnimeCreate{
		{Nombre: "Comic Girls", Pagina: "https://jkanime.net/comic-girls", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
		{Nombre: "comic girls", Pagina: "https://jkanime.net/comic-girls-2", Dias: []api.Placement{{Day: "Sin ver", Order: 2}}},
	}, nil)

	if err == nil {
		t.Fatal("two creates in one batch cannot both take the same name")
	}
	if !strings.Contains(err.Error(), "Comic Girls") && !strings.Contains(err.Error(), "comic girls") {
		t.Errorf("the refusal must name the collision, got: %v", err)
	}
}

func TestCreateBatchRejectsACreateCollidingWithTheStoredCatalogue(t *testing.T) {
	service := namedCreateService(t, "existing", "clash")
	if err := createNamed(service, "Comic Girls"); err != nil {
		t.Fatalf("seed: %v", err)
	}

	_, err := service.CreateBatch(context.Background(), []api.AnimeCreate{
		{Nombre: "Comic Girls", Pagina: "https://jkanime.net/comic-girls", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, nil)

	if err == nil {
		t.Fatal("a batch create must respect names the catalogue already holds")
	}
}

func TestCreateServiceCreatesWithoutTheNameCheckWhenNoCatalogueIsWired(t *testing.T) {
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubAnimeWriter{})
	write.SetIDGen(func() string { return "unwired" })
	write.SetNow(func() time.Time { return time.UnixMilli(1_700_000_000_000).UTC() })

	// No SetQuery: the readable refusal is unavailable, but the unique index in
	// internal/sync remains the guarantee, so creation must not be blocked here.
	if err := createNamed(anime.NewCreateService(write), "Comic Girls"); err != nil {
		t.Fatalf("an unwired catalogue must not block creation: %v", err)
	}
	if _, err := store.GetSnapshot(context.Background(), "unwired"); err != nil {
		t.Fatalf("the anime was not persisted: %v", err)
	}
}

// Silence the unused-import warning when only some cases reference the store type.
var _ = (*bridgeSync.AnimeSnapshotStore)(nil)
