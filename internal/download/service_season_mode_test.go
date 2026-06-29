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
			ID:      "anime-ver-hoy",
			Nombre:  "Ver Hoy Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: seasonModeDiaName, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/ver-hoy/"),
			Carpeta: ptrStr(t.TempDir()),
		},
		{
			ID:      "anime-weekday",
			Nombre:  "Weekday Anime",
			Activo:  1,
			Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
			Pagina:  ptrStr("https://jkanime.net/weekday/"),
			Carpeta: ptrStr(t.TempDir()),
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

	mu.Lock()
	ids := append([]string(nil), skippedIDs...)
	mu.Unlock()

	var verHoyProcessed, weekdayProcessed bool
	for _, id := range ids {
		switch id {
		case "anime-ver-hoy":
			verHoyProcessed = true
		case "anime-weekday":
			weekdayProcessed = true
		}
	}
	if !verHoyProcessed {
		t.Error("expected 'Ver hoy' anime to enter the processing pipeline in season mode")
	}
	if weekdayProcessed {
		t.Error("expected weekday anime to be excluded (not processed) when season mode is on")
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
		ID:      "anime-inactive-ver-hoy",
		Nombre:  "Inactive Ver Hoy Anime",
		Activo:  0,
		Dias:    []contracts.MobileAnimeDay{{Dia: seasonModeDiaName, Orden: 0}},
		Pagina:  ptrStr("https://jkanime.net/inactive-ver-hoy/"),
		Carpeta: ptrStr(t.TempDir()),
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
			t.Parallel()

			deps := baseDeps(t)
			dia := todayDiaName(deps.Clock())

			deps.SeasonMode = tc.seasonMode
			deps.Sites = NewStaticRegistry() // empty
			deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
				{
					ID:      "anime-ver-hoy",
					Nombre:  "Ver Hoy Anime",
					Activo:  1,
					Dias:    []contracts.MobileAnimeDay{{Dia: seasonModeDiaName, Orden: 0}},
					Pagina:  ptrStr("https://jkanime.net/ver-hoy/"),
					Carpeta: ptrStr(t.TempDir()),
				},
				{
					ID:      "anime-weekday",
					Nombre:  "Weekday Anime",
					Activo:  1,
					Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}},
					Pagina:  ptrStr("https://jkanime.net/weekday/"),
					Carpeta: ptrStr(t.TempDir()),
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
				t.Fatalf("expected weekday anime to be selected when season mode is off, got status %q",
					result.Status)
			}

			mu.Lock()
			ids := append([]string(nil), skippedIDs...)
			mu.Unlock()

			var weekdayProcessed, verHoyProcessed bool
			for _, id := range ids {
				switch id {
				case "anime-weekday":
					weekdayProcessed = true
				case "anime-ver-hoy":
					verHoyProcessed = true
				}
			}
			if !weekdayProcessed {
				t.Error("expected weekday anime to enter the pipeline when season mode is off")
			}
			if verHoyProcessed {
				t.Error("expected 'Ver hoy' anime to be excluded when season mode is off")
			}
		})
	}
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
		ID:      "anime-weekday-only",
		Nombre:  "Weekday Only Anime",
		Activo:  1,
		Dias:    []contracts.MobileAnimeDay{{Dia: dia, Orden: 0}}, // no "Ver hoy"
		Pagina:  ptrStr("https://jkanime.net/weekday-only/"),
		Carpeta: ptrStr(t.TempDir()),
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
