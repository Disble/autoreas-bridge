package download

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// TestListActiveAnimesTodayMatchesStoredSpanishDiaAgainstEnglishTarget proves the SDD-55
// Slice C read-time mapping (ADR-55-4, decision 0.2): the stored Legacy-Spanish schedule-day
// literal ("Miércoles") still selects an anime as airing today when compared against the
// English weekday representation the download-selection domain now derives internally.
func TestListActiveAnimesTodayMatchesStoredSpanishDiaAgainstEnglishTarget(t *testing.T) {
	t.Parallel()

	deps := baseDeps(t) // fixedNow is 2026-06-22, a Monday.
	deps.Animes = &svcFakeAnimeQuery{animes: []contracts.MobileAnime{
		{ID: "anime-today", Nombre: "Airs Monday", Activo: 1, Dias: []contracts.MobileAnimeDay{{Dia: "Lunes", Orden: 0}}},
		{ID: "anime-other-day", Nombre: "Airs Wednesday", Activo: 1, Dias: []contracts.MobileAnimeDay{{Dia: "Miércoles", Orden: 0}}},
	}}

	svc := NewService(deps)
	active, err := svc.listActiveAnimesToday(context.Background())
	if err != nil {
		t.Fatalf("listActiveAnimesToday: %v", err)
	}

	if len(active) != 1 || active[0].ID != "anime-today" {
		t.Fatalf("expected only anime-today to be selected, got %#v", active)
	}
}

// TestEnglishWeekdayTranslatesEverySpanishLiteral proves the read-time translation table
// covers all seven Legacy-Spanish weekday literals and passes non-weekday sentinels
// (e.g. the "Ver hoy" season-mode value) through unchanged.
func TestEnglishWeekdayTranslatesEverySpanishLiteral(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"Lunes":     "Monday",
		"Martes":    "Tuesday",
		"Miércoles": "Wednesday",
		"Jueves":    "Thursday",
		"Viernes":   "Friday",
		"Sábado":    "Saturday",
		"Domingo":   "Sunday",
		"Ver hoy":   "Ver hoy",
	}

	for dia, want := range tests {
		if got := englishWeekday(dia); got != want {
			t.Fatalf("englishWeekday(%q) = %q, want %q", dia, got, want)
		}
	}
}
