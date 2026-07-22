package anime_test

import (
	"bufio"
	"bytes"
	"context"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
)

// historyFixtureLines are hand-authored stored-shape records covering the
// membership/ordering/projection edge cases the real Autoreas library
// fixture used to exercise (tasks.md Phase 1.1): mixed presence of
// fechaUltCapVisto, tipo, and fechaCreacion, across multiple distinct
// timestamps to prove non-increasing ordering.
//
// SDD-55 Slice B: resources/autoreas-data/animes.dat (the Legacy append-only
// file, gitignored private user data) and its streaming parser are deleted.
// This fixture no longer reads that real file at runtime -- it pins the same
// shape as small, non-identifying synthetic records instead.
var historyFixtureLines = []string{
	`{"id":"history-1","name":"History One","episodesWatched":12,"status":1,"kind":0,"createdAt":1000,"lastWatchedAt":3000}`,
	`{"id":"history-2","name":"History Two","episodesWatched":5,"status":2,"lastWatchedAt":2000}`,
	`{"id":"history-3","name":"History Three","episodesWatched":8,"status":1,"kind":1,"createdAt":1500,"lastWatchedAt":1000}`,
	`{"id":"history-4","name":"History Four (never watched)","episodesWatched":0,"status":0}`,
}

// TestQueryServiceListAnimeHistoryMatchesFixtureMembershipAndOrdering
// validates ListAnimeHistory (Anime History spec, "History Read Model")
// against historyFixtureLines: the expected membership count is derived from
// the fixture itself in test setup (records with a present fechaUltCapVisto),
// never hardcoded, and the result MUST be non-increasing by FechaUltCapVisto.
func TestQueryServiceListAnimeHistoryMatchesFixtureMembershipAndOrdering(t *testing.T) {
	t.Parallel()

	data := []byte(strings.Join(historyFixtureLines, "\n"))
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

// parseFixtureHistoryRecords decodes one already-deduped snapshot per line
// from the real-data-derived fixture into snapshot records.
func parseFixtureHistoryRecords(t *testing.T, data []byte) map[string]anime.SnapshotRecord {
	t.Helper()
	records := make(map[string]anime.SnapshotRecord)
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		value, canonical, err := store.Decode(line)
		if err != nil {
			t.Fatalf("decode fixture line: %v", err)
		}
		records[value.ID] = anime.SnapshotRecord{
			AnimeID: value.ID, CanonicalJSON: canonical, Hash: anime.HashSnapshot(canonical),
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan fixture: %v", err)
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
		if item.Kind != nil {
			gotTipoCount++
		}
		if item.CreatedAt != nil {
			gotFechaCreacionCount++
		}
	}
	return gotTipoCount, gotFechaCreacionCount
}

// assertHistoryOrder verifies the ordering of projected history items.
func assertHistoryOrder(t *testing.T, items []contracts.AnimeHistoryItem) {
	t.Helper()
	for i := 1; i < len(items); i++ {
		if items[i-1].LastWatchedAt < items[i].LastWatchedAt {
			t.Fatalf("expected non-increasing fechaUltCapVisto ordering at index %d: %d < %d", i, items[i-1].LastWatchedAt, items[i].LastWatchedAt)
		}
	}
}
