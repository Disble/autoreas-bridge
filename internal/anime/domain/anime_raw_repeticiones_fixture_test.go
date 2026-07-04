package domain

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
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
	estadoSet := map[int]struct{}{}

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

		repeticiones := raw.Repeticiones()
		if len(repeticiones) == 0 {
			emptyCount++
		} else {
			nonEmpty++
		}
		for _, repeticion := range repeticiones {
			estadoSet[repeticion.Estado] = struct{}{}
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

	// Documents the real repetir estado domain observed in production data
	// (Anime Detail delta spec, "Repetition entry shows the full Legacy
	// record"): only 1 (Finalizado), 2 (Abandonado), and 3 (Pendiente) are
	// present -- 0 (Viendo) never appears for a closed-out repetition, which
	// makes sense (a repetition still "Viendo" wouldn't yet have rolled into
	// a new repetir entry). No unrecognized code was observed, so the
	// frontend's raw-fallback path for an unknown estado is untested by this
	// fixture and remains a defensive-only branch.
	gotEstados := make([]int, 0, len(estadoSet))
	for estado := range estadoSet {
		gotEstados = append(gotEstados, estado)
	}
	slices.Sort(gotEstados)
	wantEstados := []int{1, 2, 3}
	if !slices.Equal(gotEstados, wantEstados) {
		t.Fatalf("expected distinct repetir estado codes %v, got %v", wantEstados, gotEstados)
	}
}
