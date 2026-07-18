package anime

import (
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

func TestNormalizeSchedulePlacementsMapNormalizesAllowedDestinationsDeterministically(t *testing.T) {
	placements := map[string][]contracts.MobileAnimeDay{
		"anime-b": {{Dia: "Lunes", Orden: 1}},
		"anime-a": {{Dia: "Lunes", Orden: 1}},
		"anime-c": {{Dia: "Visto", Orden: 4}},
	}

	normalized := normalizeSchedulePlacementsMap(placements)

	assertNormalizedPlacement(t, normalized, "anime-a", "Lunes", 1)
	assertNormalizedPlacement(t, normalized, "anime-b", "Lunes", 2)
	assertNormalizedPlacement(t, normalized, "anime-c", "Visto", 1)
}

func TestNormalizeSchedulePlacementsMapPreservesUnsupportedDestinations(t *testing.T) {
	placements := map[string][]contracts.MobileAnimeDay{
		"legacy":  {{Dia: "Especial legado", Orden: 9}},
		"anime-a": {{Dia: "Martes", Orden: 2}},
		"anime-b": {{Dia: "Martes", Orden: 1}},
	}

	normalized := normalizeSchedulePlacementsMap(placements)

	assertNormalizedPlacement(t, normalized, "anime-b", "Martes", 1)
	assertNormalizedPlacement(t, normalized, "anime-a", "Martes", 2)
	assertNormalizedPlacement(t, normalized, "legacy", "Especial legado", 9)
}

// assertNormalizedPlacement verifies one normalized placement.
func assertNormalizedPlacement(t *testing.T, placementsByAnime map[string][]contracts.MobileAnimeDay, animeID, destination string, order int) {
	t.Helper()
	placements := placementsByAnime[animeID]
	if len(placements) != 1 || placements[0].Dia != destination || placements[0].Orden != order {
		t.Fatalf("expected %s at %s#%d, got %+v", animeID, destination, order, placements)
	}
}
