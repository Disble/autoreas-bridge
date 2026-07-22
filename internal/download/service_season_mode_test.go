package download

import (
	"context"
	"sync"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// TestRunOnceSeasonModeOnSelectsVerHoyAnimeExcludesWeekday covers spec scenario "Season mode on
// selects the 'Ver hoy' set": with season mode enabled, only animes whose Dias contains
// "Ver hoy" are selected; today's weekday anime is excluded from the run.
func TestRunOnceSeasonModeOnSelectsVerHoyAnimeExcludesWeekday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())

	deps.SeasonMode = func(_ context.Context) bool { return true }
	deps.Sites = NewStaticRegistry() // empty — any selected anime generates DownloadSkippedEvent
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{
			ID:        "anime-ver-hoy",
			Name:      "Ver Hoy Anime",
			Active:    1,
			Days:      []contracts.MobileAnimeDay{{Day: seasonModeDiaName, Order: 0}},
			SourceURL: ptrStr("https://jkanime.net/ver-hoy/"),
			Folder:    ptrStr(t.TempDir()),
		},
		{
			ID:        "anime-weekday",
			Name:      "Weekday Anime",
			Active:    1,
			Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}},
			SourceURL: ptrStr("https://jkanime.net/weekday/"),
			Folder:    ptrStr(t.TempDir()),
		},
	}}

	var mu sync.Mutex
	var skippedIDs []string
	deps.Bus.Subscribe(events.EventNameDownloadSkipped, func(e events.Event) {
		ev := e.(events.DownloadSkippedEvent)
		mu.Lock()
		skippedIDs = append(skippedIDs, ev.AnimeID)
		mu.Unlock()
	})

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status == RunStatusNoAnimesToday {
		t.Fatalf("expected 'Ver hoy' anime to be selected in season mode, got status %q", result.Status)
	}

	assertSeasonModeProcessedIDs(t, &mu, skippedIDs)
}

// assertWeekdayModeProcessedIDs verifies weekday mode excludes season-mode anime.
func assertWeekdayModeProcessedIDs(t *testing.T, mu *sync.Mutex, skippedIDs []string) {
	t.Helper()
	mu.Lock()
	ids := append([]string(nil), skippedIDs...)
	mu.Unlock()
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	if !seen["anime-weekday"] || seen["anime-ver-hoy"] {
		t.Fatalf("unexpected weekday-mode processed ids: %#v", ids)
	}
}

// assertSeasonModeProcessedIDs verifies season mode selects only season-mode anime.
func assertSeasonModeProcessedIDs(t *testing.T, mu *sync.Mutex, skippedIDs []string) {
	t.Helper()
	mu.Lock()
	ids := append([]string(nil), skippedIDs...)
	mu.Unlock()
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	if !seen["anime-ver-hoy"] || seen["anime-weekday"] {
		t.Fatalf("unexpected season-mode processed ids: %#v", ids)
	}
}

// TestRunOnceSeasonModeOnInactiveVerHoyExcluded covers spec scenario "Active gate still applies
// in season mode": an anime with "Ver hoy" in its Dias but Activo==0 is NOT selected even when
// season mode is enabled. The activo gate is unconditional.
func TestRunOnceSeasonModeOnInactiveVerHoyExcluded(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	deps.SeasonMode = func(_ context.Context) bool { return true }
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-inactive-ver-hoy",
		Name:      "Inactive Ver Hoy Anime",
		Active:    0,
		Days:      []contracts.MobileAnimeDay{{Day: seasonModeDiaName, Order: 0}},
		SourceURL: ptrStr("https://jkanime.net/inactive-ver-hoy/"),
		Folder:    ptrStr(t.TempDir()),
	}}}

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected %q for inactive 'Ver hoy' anime in season mode, got %q",
			RunStatusNoAnimesToday, result.Status)
	}
}

// TestRunOnceSeasonModeOffSelectsWeekdayExcludesVerHoy covers spec scenarios "Season mode off
// selects today's weekday (unchanged)" and "Missing season-mode seam defaults to weekday
// selection": both explicit-false and nil seam must select the weekday anime and exclude the
// "Ver hoy" anime.
func TestRunOnceSeasonModeOffSelectsWeekdayExcludesVerHoy(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name       string
		seasonMode func(context.Context) bool // nil exercises the nil-seam default path
	}{
		{name: "explicit_false", seasonMode: func(_ context.Context) bool { return false }},
		{name: "nil_seam", seasonMode: nil},
	} {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			assertSeasonModeOffSelection(t, tc.seasonMode)
		})
	}
}

// assertSeasonModeOffSelection verifies explicit and default weekday selection.
func assertSeasonModeOffSelection(t *testing.T, seasonMode func(context.Context) bool) {
	t.Helper()
	t.Parallel()
	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	deps.SeasonMode = seasonMode
	deps.Sites = NewStaticRegistry()
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "anime-ver-hoy", Name: "Ver Hoy Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: seasonModeDiaName, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/ver-hoy/"), Folder: ptrStr(t.TempDir())},
		{ID: "anime-weekday", Name: "Weekday Anime", Active: 1, Days: []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, SourceURL: ptrStr("https://jkanime.net/weekday/"), Folder: ptrStr(t.TempDir())},
	}}
	var mu sync.Mutex
	var skippedIDs []string
	deps.Bus.Subscribe(events.EventNameDownloadSkipped, func(e events.Event) {
		mu.Lock()
		skippedIDs = append(skippedIDs, e.(events.DownloadSkippedEvent).AnimeID)
		mu.Unlock()
	})
	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil || result.Status == RunStatusNoAnimesToday {
		t.Fatalf("expected weekday anime to be selected when season mode is off, result=%#v err=%v", result, err)
	}
	assertWeekdayModeProcessedIDs(t, &mu, skippedIDs)
}

// TestRunOnceSeasonModeOnNoVerHoyAnimesYieldsNoAnimesToday covers spec scenario "Season mode on
// with no 'Ver hoy' animes yields no_animes_today": when season mode is enabled but no active
// anime has "Ver hoy" in its Dias, the run finalizes with terminal status no_animes_today.
func TestRunOnceSeasonModeOnNoVerHoyAnimesYieldsNoAnimesToday(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t)
	dia := todayDiaName(deps.Clock())
	deps.SeasonMode = func(_ context.Context) bool { return true }
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{{
		ID:        "anime-weekday-only",
		Name:      "Weekday Only Anime",
		Active:    1,
		Days:      []contracts.MobileAnimeDay{{Day: dia, Order: 0}}, // no "Ver hoy"
		SourceURL: ptrStr("https://jkanime.net/weekday-only/"),
		Folder:    ptrStr(t.TempDir()),
	}}}

	result, err := NewService(deps).RunOnce(context.Background(), "manual")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if result.Status != RunStatusNoAnimesToday {
		t.Fatalf("expected %q when season mode is on and no 'Ver hoy' animes exist, got %q",
			RunStatusNoAnimesToday, result.Status)
	}
}
