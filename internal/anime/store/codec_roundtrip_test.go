package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime/domain"
)

// TestCodecRoundTripPreservesRealStoredSnapshotShape proves the relocated
// AnimeRaw codec (decode -> domain merge -> encode) preserves every unknown
// Spanish key byte-for-byte on a real stored snapshot_json shape. The fixture
// is a clone of one real resources/autoreas-data/animes.dat line copied into
// t.TempDir() -- the real fixture itself is never mutated (bridge-testing
// skill, "real fixtures beat comfortable mocks").
func TestCodecRoundTripPreservesRealStoredSnapshotShape(t *testing.T) {
	original, err := os.ReadFile(filepath.Join("testdata", "real_snapshot_shape.jsonl"))
	if err != nil {
		t.Fatalf("read cloned real snapshot fixture: %v", err)
	}

	tempDir := t.TempDir()
	clonedPath := filepath.Join(tempDir, "real_snapshot_shape.jsonl")
	if err := os.WriteFile(clonedPath, original, 0o600); err != nil {
		t.Fatalf("write cloned fixture into t.TempDir(): %v", err)
	}
	payload, err := os.ReadFile(clonedPath)
	if err != nil {
		t.Fatalf("read cloned fixture: %v", err)
	}

	raw, value, canonical, err := DecodeForUpdate(payload)
	if err != nil {
		t.Fatalf("decode real stored snapshot shape: %v", err)
	}

	// No-op merge: re-apply the domain value onto itself and re-encode. The
	// resulting canonical JSON must byte-for-byte match the first decode's
	// canonical output, proving known English keys and the still-unrecognized
	// fechaPublicacion field survive an untouched decode -> merge -> encode
	// cycle.
	merged, err := NewMapper().Merge(raw, value)
	if err != nil {
		t.Fatalf("merge real stored snapshot shape: %v", err)
	}
	reencoded, err := merged.MarshalJSON()
	if err != nil {
		t.Fatalf("re-marshal real stored snapshot shape: %v", err)
	}
	if string(reencoded) != string(canonical) {
		t.Fatalf("no-op merge changed canonical JSON:\nfirst:  %s\nsecond: %s", canonical, reencoded)
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(reencoded, &fields); err != nil {
		t.Fatalf("unmarshal re-encoded canonical JSON: %v", err)
	}
	for _, key := range []string{"studios", "origin", "genres", "durationMinutes", "cover", "repetitions", "fechaPublicacion", "folder", "sourceUrl"} {
		if _, ok := fields[key]; !ok {
			t.Fatalf("expected key %q to survive the round trip, fields: %v", key, fields)
		}
	}

	var value2 domain.Anime
	if _, value2, _, err = DecodeForUpdate(reencoded); err != nil {
		t.Fatalf("decode re-encoded payload: %v", err)
	}
	if value2.ID != value.ID || value2.Title != value.Title {
		t.Fatalf("domain projection changed across round trip: got %+v, want %+v", value2, value)
	}
}

// TestPackageRelocationSmokeReadWriteStaysGreen is the package-relocation
// smoke test (B1.2): a bare decode -> encode pass through the relocated
// `store` package (no "legacy" package reference) must stay green, proving
// the read/write path survives the package move with no behavior change.
func TestPackageRelocationSmokeReadWriteStaysGreen(t *testing.T) {
	payload := []byte(`{"id":"smoke-1","name":"Smoke Test Anime","episodesWatched":3}`)

	value, canonical, err := Decode(payload)
	if err != nil {
		t.Fatalf("decode via relocated store package: %v", err)
	}
	if value.ID != "smoke-1" || value.Title != "Smoke Test Anime" || value.Progress != 3 {
		t.Fatalf("unexpected decoded domain value: %+v", value)
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(canonical, &fields); err != nil {
		t.Fatalf("unmarshal canonical JSON: %v", err)
	}
	if _, ok := fields["id"]; !ok {
		t.Fatalf("expected canonical JSON to retain id field, got: %s", canonical)
	}
}
