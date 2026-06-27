package anime

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"autoreas-bridge/internal/anime/domain"
)

func TestSnapshotParserStripsUTF8BOMFromFirstLine(t *testing.T) {
	t.Parallel()

	parser := NewSnapshotParser()
	input := strings.NewReader("\ufeff{" + `"_id":"anime-1","nombre":"BOM","nrocapvisto":1}` + "\n")

	got, warnings, err := parser.Parse(input)
	if err != nil {
		t.Fatalf("parse with bom: %v", err)
	}

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %+v", warnings)
	}

	record, ok := got["anime-1"]
	if !ok {
		t.Fatal("expected parsed snapshot for anime-1")
	}

	assertSnapshotMatchesPayload(t, record, `{"_id":"anime-1","nombre":"BOM","nrocapvisto":1}`)
}

func TestSnapshotParserWarnsAndContinuesAfterCorruptLine(t *testing.T) {
	t.Parallel()

	parser := NewSnapshotParser()
	input := strings.NewReader(strings.Join([]string{
		`{"_id":"anime-1","nombre":"First","nrocapvisto":1}`,
		`{"_id":"broken",`,
		`{"_id":"anime-2","nombre":"Second","nrocapvisto":2}`,
	}, "\n"))

	got, warnings, err := parser.Parse(input)
	if err != nil {
		t.Fatalf("parse with corrupt line: %v", err)
	}

	if len(warnings) != 1 {
		t.Fatalf("expected 1 warning, got %+v", warnings)
	}

	if warnings[0].Line != 2 {
		t.Fatalf("expected warning on line 2, got %+v", warnings[0])
	}

	if !strings.Contains(strings.ToLower(warnings[0].Reason), "decode") && !strings.Contains(strings.ToLower(warnings[0].Reason), "unmarshal") {
		t.Fatalf("expected warning reason to mention decode/unmarshal, got %q", warnings[0].Reason)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 healthy snapshots, got %d", len(got))
	}

	assertSnapshotMatchesPayload(t, got["anime-1"], `{"_id":"anime-1","nombre":"First","nrocapvisto":1}`)
	assertSnapshotMatchesPayload(t, got["anime-2"], `{"_id":"anime-2","nombre":"Second","nrocapvisto":2}`)
}

func TestSnapshotParserSupportsLongLinesAndCanonicalHashesPerID(t *testing.T) {
	t.Parallel()

	longName := strings.Repeat("L", 70_000)
	firstLine := `{"_id":"anime-1","nombre":"old","nrocapvisto":1}`
	lastLine := fmt.Sprintf(`{"_id":"anime-1","nombre":%q,"nrocapvisto":10.5}`, longName)

	parser := NewSnapshotParser()
	got, warnings, err := parser.Parse(strings.NewReader(firstLine + "\n" + lastLine + "\n"))
	if err != nil {
		t.Fatalf("parse long lines: %v", err)
	}

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %+v", warnings)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 effective snapshot, got %d", len(got))
	}

	assertSnapshotMatchesPayload(t, got["anime-1"], lastLine)
}

func TestSnapshotParserDistinguishesTombstonesFromInactiveRecords(t *testing.T) {
	t.Parallel()

	parser := NewSnapshotParser()
	input := strings.NewReader(strings.Join([]string{
		`{"_id":"inactive","nombre":"Still There","nrocapvisto":4,"activo":false}`,
		`{"_id":"gone","nombre":"Gone Soon","nrocapvisto":1}`,
		`{"$$deleted":true,"_id":"gone"}`,
	}, "\n"))

	got, warnings, err := parser.Parse(input)
	if err != nil {
		t.Fatalf("parse tombstones: %v", err)
	}

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %+v", warnings)
	}

	if _, ok := got["gone"]; ok {
		t.Fatal("expected tombstone to remove gone from effective map")
	}

	record, ok := got["inactive"]
	if !ok {
		t.Fatal("expected inactive anime to remain in effective map")
	}

	assertSnapshotMatchesPayload(t, record, `{"_id":"inactive","nombre":"Still There","nrocapvisto":4,"activo":false}`)
}

func TestSnapshotParserParsesRealFixtureWithoutFatalWarnings(t *testing.T) {
	t.Parallel()

	sourcePath := filepath.Join("..", "..", "resources", "autoreas-data", "animes.dat")
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real Autoreas fixture not present at %s; resources/autoreas-data/*.dat is gitignored private data", sourcePath)
		}
		t.Fatalf("read fixture: %v", err)
	}

	tempPath := filepath.Join(t.TempDir(), "animes.dat")
	if err := os.WriteFile(tempPath, data, 0o600); err != nil {
		t.Fatalf("write fixture copy: %v", err)
	}

	file, err := os.Open(tempPath)
	if err != nil {
		t.Fatalf("open fixture copy: %v", err)
	}
	defer file.Close()

	parser := NewSnapshotParser()
	got, warnings, err := parser.Parse(file)
	if err != nil {
		t.Fatalf("parse real fixture: %v", err)
	}

	if len(got) == 0 {
		t.Fatal("expected real fixture to produce effective state")
	}

	for _, warning := range warnings {
		if strings.TrimSpace(warning.Reason) == "" {
			t.Fatalf("expected warning reason to be informative, got %+v", warning)
		}
	}
	// No fatal warning contract: parse succeeds and still returns effective state.
}

func TestDiffSnapshotsSkipsUnchangedEffectiveRecords(t *testing.T) {
	t.Parallel()

	record := SnapshotRecord{
		AnimeID:       "same",
		CanonicalJSON: []byte(`{"_id":"same","nombre":"Stable","nrocapvisto":4}`),
		Hash:          HashSnapshot([]byte(`{"_id":"same","nombre":"Stable","nrocapvisto":4}`)),
	}

	deltas, pruneIDs := DiffSnapshots(
		map[string]SnapshotRecord{"same": record},
		map[string]SnapshotRecord{"same": record},
	)

	if len(deltas) != 0 {
		t.Fatalf("expected no deltas for unchanged record, got %+v", deltas)
	}

	if len(pruneIDs) != 0 {
		t.Fatalf("expected no prune ids for unchanged record, got %v", pruneIDs)
	}
}

func assertSnapshotMatchesPayload(t *testing.T, got SnapshotRecord, wantPayload string) {
	t.Helper()

	var raw domain.LegacyAnimeRaw
	if err := json.Unmarshal([]byte(wantPayload), &raw); err != nil {
		t.Fatalf("unmarshal wanted legacy payload: %v", err)
	}

	canonical, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal wanted canonical payload: %v", err)
	}

	if got.AnimeID != raw.ID {
		t.Fatalf("expected anime id %q, got %q", raw.ID, got.AnimeID)
	}

	if string(got.CanonicalJSON) != string(canonical) {
		t.Fatalf("expected canonical json %s, got %s", string(canonical), string(got.CanonicalJSON))
	}

	wantHash := HashSnapshot(canonical)
	if got.Hash != wantHash {
		t.Fatalf("expected hash %q, got %q", wantHash, got.Hash)
	}
}
