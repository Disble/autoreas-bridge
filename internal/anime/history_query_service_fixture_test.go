package anime_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
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

	records := parseFixtureHistoryRecords(t, data)
	wantCount, wantTipoCount, wantFechaCreacionCount := summarizeFixtureHistory(t, records)
	if wantCount == 0 {
		t.Fatal("expected at least one fixture record with fechaUltCapVisto present -- fixture or membership logic changed")
	}
	if wantTipoCount == 0 {
		t.Fatal("expected at least one fixture history record with tipo present -- fixture or projection changed")
	}
	if wantFechaCreacionCount == 0 {
		t.Fatal("expected at least one fixture history record with fechaCreacion present -- fixture or projection changed")
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

	gotTipoCount, gotFechaCreacionCount := summarizeProjectedHistory(got)
	if gotTipoCount != wantTipoCount {
		t.Fatalf("expected %d history entries carrying tipo, got %d", wantTipoCount, gotTipoCount)
	}
	if gotFechaCreacionCount != wantFechaCreacionCount {
		t.Fatalf("expected %d history entries carrying fechaCreacion, got %d", wantFechaCreacionCount, gotFechaCreacionCount)
	}

	assertHistoryOrder(t, got)
}

// parseFixtureHistoryRecords parses snapshot records from the real fixture.
func parseFixtureHistoryRecords(t *testing.T, data []byte) map[string]anime.SnapshotRecord {
	t.Helper()
	parser := anime.NewSnapshotParser()
	records, warnings, err := parser.Parse(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("parse real fixture: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("expected no parse warnings for real fixture, got %v", warnings)
	}
	return records
}

// summarizeFixtureHistory counts history categories in fixture records.
func summarizeFixtureHistory(t *testing.T, records map[string]anime.SnapshotRecord) (int, int, int) {
	t.Helper()
	wantCount := 0
	wantTipoCount := 0
	wantFechaCreacionCount := 0
	for _, record := range records {
		value := decodeAnimeDomain(t, record.CanonicalJSON)
		if value.LastWatchedAt == nil {
			continue
		}
		wantCount++
		if value.ContentType != nil {
			wantTipoCount++
		}
		if value.CreatedAt != nil {
			wantFechaCreacionCount++
		}
	}
	return wantCount, wantTipoCount, wantFechaCreacionCount
}

// summarizeProjectedHistory counts categories in projected history items.
func summarizeProjectedHistory(items []contracts.AnimeHistoryItem) (int, int) {
	gotTipoCount := 0
	gotFechaCreacionCount := 0
	for _, item := range items {
		if item.Tipo != nil {
			gotTipoCount++
		}
		if item.FechaCreacion != nil {
			gotFechaCreacionCount++
		}
	}
	return gotTipoCount, gotFechaCreacionCount
}

// assertHistoryOrder verifies the ordering of projected history items.
func assertHistoryOrder(t *testing.T, items []contracts.AnimeHistoryItem) {
	t.Helper()
	for i := 1; i < len(items); i++ {
		if items[i-1].FechaUltCapVisto < items[i].FechaUltCapVisto {
			t.Fatalf("expected non-increasing fechaUltCapVisto ordering at index %d: %d < %d", i, items[i-1].FechaUltCapVisto, items[i].FechaUltCapVisto)
		}
	}
}
