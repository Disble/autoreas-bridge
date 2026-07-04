package anime_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
)

// TestQueryServiceListAnimeHistoryMatchesRealFixtureMembershipAndOrdering
// validates ListAnimeHistory (Anime History spec, "History Read Model")
// against the real autoreas-data fixture (tasks.md Phase 1.1): the expected
// membership count is derived from the fixture itself in test setup (records
// with a present fechaUltCapVisto), never hardcoded, and the result MUST be
// non-increasing by FechaUltCapVisto.
func TestQueryServiceListAnimeHistoryMatchesRealFixtureMembershipAndOrdering(t *testing.T) {
	t.Parallel()

	sourcePath := filepath.Join("..", "..", "resources", "autoreas-data", "animes.dat")
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real Autoreas fixture not present at %s; resources/autoreas-data/*.dat is gitignored private data", sourcePath)
		}
		t.Fatalf("read real fixture: %v", err)
	}

	parser := anime.NewSnapshotParser()
	records, warnings, err := parser.Parse(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("parse real fixture: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("expected no parse warnings for real fixture, got %v", warnings)
	}

	wantCount := 0
	for _, record := range records {
		var raw domain.LegacyAnimeRaw
		if err := json.Unmarshal(record.CanonicalJSON, &raw); err != nil {
			t.Fatalf("unmarshal canonical record %q: %v", record.AnimeID, err)
		}
		if raw.FechaUltCapVisto.Time() != nil {
			wantCount++
		}
	}
	if wantCount == 0 {
		t.Fatal("expected at least one fixture record with fechaUltCapVisto present -- fixture or membership logic changed")
	}

	store := openAnimeServiceTestStore(t)
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed store from real fixture: %v", err)
	}

	service := anime.NewQueryService(store)
	got, err := service.ListAnimeHistory(context.Background())
	if err != nil {
		t.Fatalf("list anime history: %v", err)
	}

	if len(got) != wantCount {
		t.Fatalf("expected %d history entries derived from the fixture, got %d", wantCount, len(got))
	}

	for i := 1; i < len(got); i++ {
		if got[i-1].FechaUltCapVisto < got[i].FechaUltCapVisto {
			t.Fatalf("expected non-increasing fechaUltCapVisto ordering at index %d: %d < %d", i, got[i-1].FechaUltCapVisto, got[i].FechaUltCapVisto)
		}
	}
}
