package desktop

import (
	"encoding/json"
	"testing"

	"autoreas-bridge/internal/download"
)

// TestToContractsDownloadRunViewCarriesManualLinkAnimeID pins that the anime id stored on a
// JD-offline manual link reaches the frontend JSON, and that an old link without one omits it.
func TestToContractsDownloadRunViewCarriesManualLinkAnimeID(t *testing.T) {
	run := download.Run{ManualLinks: []download.ManualLink{
		{AnimeID: "anime-1", Anime: "Frieren", Episode: 5, Links: []string{"https://a"}},
		{Anime: "Old row", Episode: 2, Links: []string{"https://b"}},
	}}

	raw, err := json.Marshal(toContractsDownloadRunView(run).ManualLinks)
	if err != nil {
		t.Fatalf("marshal manual links: %v", err)
	}

	want := `[{"animeId":"anime-1","anime":"Frieren","episode":5,"links":["https://a"]},{"anime":"Old row","episode":2,"links":["https://b"]}]`
	if string(raw) != want {
		t.Fatalf("manual links JSON = %s, want %s", raw, want)
	}
}
