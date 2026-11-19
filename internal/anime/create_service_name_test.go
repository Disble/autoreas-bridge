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
	write := anime.NewWriteService(store, &stubCommittedPublisher{})
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

// TestCreateServiceNameGuard drives one catalogue through the name guard: a
// held name is refused naming the holder, case and padding never make a new
// name, a batch create respects stored names, and a distinct name still passes.
func TestCreateServiceNameGuard(t *testing.T) {
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

	if err := createNamed(service, "  comic girls  "); err == nil || !strings.Contains(err.Error(), `already exists as "first"`) {
		t.Fatalf("names differing only by case or padding are the same name, got: %v", err)
	}

	_, err = service.CreateBatch(context.Background(), []api.AnimeCreate{
		{Nombre: "Comic Girls", Pagina: "https://jkanime.net/comic-girls", Dias: []api.Placement{{Day: "Sin ver", Order: 1}}},
	}, nil)
	if err == nil || !strings.Contains(err.Error(), `already exists as "first"`) {
		t.Fatalf("a batch create must respect names the catalogue already holds, got: %v", err)
	}

	if err := createNamed(service, "Comic Girls OVA"); err != nil {
		t.Fatalf("a different work must still be creatable: %v", err)
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

func TestCreateServiceCreatesWithoutTheNameCheckWhenNoCatalogueIsWired(t *testing.T) {
	store := openAnimeServiceTestStore(t)
	write := anime.NewWriteService(store, &stubCommittedPublisher{})
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
