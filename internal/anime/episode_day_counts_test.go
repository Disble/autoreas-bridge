package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
)

func TestEpisodeServiceListEpisodeDayCountsCountsActiveEstadoPositiveEntriesPerDay(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-finished",
		`{"_id":"anime-finished","nombre":"Finished","nrocapvisto":12,"estado":1,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":1}]}`)
	seedAnimeSnapshot(t, store, "anime-watching",
		`{"_id":"anime-watching","nombre":"Watching","nrocapvisto":3,"estado":0,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":1}]}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeDayCounts(ctx)
	if err != nil {
		t.Fatalf("list episode day counts: %v", err)
	}

	counts := dayCountsByDay(got)
	if counts["Lunes"] != 1 {
		t.Fatalf("expected Lunes count 1 (only the estado>0 entry), got %#v", counts)
	}
}

// TestEpisodeServiceListEpisodeDayCountsExcludesInactiveFlaggedEntries covers
// the "explicitly inactive" half of the spec scenario "Inactive-flagged
// entries excluded, absent-flag entries included".
//
// DOCUMENTED SPEC/DESIGN DRIFT (flagged for sdd-verify): the "absent-flag
// entries included" half of that scenario is NOT implementable as literally
// written. contracts.MobileAnime.Activo is already an int by the time
// EpisodeQuery.ListMobileAnimes returns it (mobile.go's triStateToInt maps
// BOTH domain.TriStateFalse and domain.TriStateAbsent to 0 -- only
// TriStateTrue becomes 1), so an absent `activo` field is indistinguishable
// from an explicit `false` at this layer. Reaching the literal tri-state
// behaviour would require exposing domain.Anime.ActivoState (a TriState)
// through EpisodeQuery instead of the collapsed contracts.MobileAnime.Activo
// int -- out of scope for this slice per design.md's "locked by proposal,
// not reopened here". Per design.md G5's own drift note, this query
// deliberately reuses ListEpisodeSchedule's existing Activo == 0 exclusion
// (episode_service.go) for internal consistency with the schedule the
// badges annotate, so an absent-flag anime is excluded here exactly like an
// explicitly-inactive one.
func TestEpisodeServiceListEpisodeDayCountsExcludesInactiveFlaggedEntries(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-inactive",
		`{"_id":"anime-inactive","nombre":"Inactive","nrocapvisto":12,"estado":1,"activo":false,`+
			`"dias":[{"dia":"Martes","orden":1}]}`)
	seedAnimeSnapshot(t, store, "anime-active",
		`{"_id":"anime-active","nombre":"Active","nrocapvisto":8,"estado":2,"activo":true,`+
			`"dias":[{"dia":"Martes","orden":1}]}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeDayCounts(ctx)
	if err != nil {
		t.Fatalf("list episode day counts: %v", err)
	}

	counts := dayCountsByDay(got)
	if counts["Martes"] != 1 {
		t.Fatalf("expected Martes count 1 (explicit-inactive excluded, explicit-active included), got %#v", counts)
	}
}

func TestEpisodeServiceListEpisodeDayCountsIncrementsEveryDayForMultiDayAnime(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-multiday",
		`{"_id":"anime-multiday","nombre":"MultiDay","nrocapvisto":12,"estado":3,"activo":true,`+
			`"dias":[{"dia":"Lunes","orden":1},{"dia":"Miercoles","orden":2}]}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeDayCounts(ctx)
	if err != nil {
		t.Fatalf("list episode day counts: %v", err)
	}

	counts := dayCountsByDay(got)
	if counts["Lunes"] != 1 || counts["Miercoles"] != 1 {
		t.Fatalf("expected both scheduled days incremented, got %#v", counts)
	}
}

func TestEpisodeServiceListEpisodeDayCountsOnEmptyListReturnsEmptyResult(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeDayCounts(ctx)
	if err != nil {
		t.Fatalf("list episode day counts: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty result for an empty anime list, got %#v", got)
	}
}

func TestEpisodeServiceListEpisodeDayCountsOmitsZeroCountDays(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-watching-only",
		`{"_id":"anime-watching-only","nombre":"WatchingOnly","nrocapvisto":3,"estado":0,"activo":true,`+
			`"dias":[{"dia":"Jueves","orden":1}]}`)

	service := anime.NewEpisodeService(anime.EpisodeServiceDeps{Query: anime.NewQueryService(store)})

	got, err := service.ListEpisodeDayCounts(ctx)
	if err != nil {
		t.Fatalf("list episode day counts: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no entries for a day whose only anime has estado 0, got %#v", got)
	}
}

// dayCountsByDay indexes episode counts by day for assertions.
func dayCountsByDay(counts []anime.EpisodeDayCount) map[string]int {
	byDay := make(map[string]int, len(counts))
	for _, c := range counts {
		byDay[c.Day] = c.Count
	}
	return byDay
}
