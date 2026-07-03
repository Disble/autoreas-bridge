package domain

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestLegacyAnimeRawRepeticionesProjectsRealFixtureSplit is the real-boundary
// test (bridge-testing convention): it parses every line of the real
// resources/autoreas-data/animes.dat fixture and asserts the exact
// empty/non-empty Repeticiones() split verified in design.md (795 records:
// 743 empty timelines, 52 non-empty).
func TestLegacyAnimeRawRepeticionesProjectsRealFixtureSplit(t *testing.T) {
	t.Parallel()

	sourcePath := filepath.Join("..", "..", "..", "resources", "autoreas-data", "animes.dat")
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real Autoreas fixture not present at %s; resources/autoreas-data/*.dat is gitignored private data", sourcePath)
		}
		t.Fatalf("read fixture: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 0 {
		t.Fatal("expected fixture to contain at least one line")
	}

	var (
		totalParsed int
		emptyCount  int
		nonEmpty    int
	)

	for index, line := range lines {
		line := strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var raw LegacyAnimeRaw
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			t.Fatalf("line %d unmarshal legacy anime raw: %v", index+1, err)
		}
		totalParsed++

		if len(raw.Repeticiones()) == 0 {
			emptyCount++
		} else {
			nonEmpty++
		}
	}

	if totalParsed != 795 {
		t.Fatalf("expected 795 parsed records, got %d", totalParsed)
	}
	if emptyCount != 743 {
		t.Fatalf("expected 743 records with empty Repeticiones(), got %d", emptyCount)
	}
	if nonEmpty != 52 {
		t.Fatalf("expected 52 records with non-empty Repeticiones(), got %d", nonEmpty)
	}
}
