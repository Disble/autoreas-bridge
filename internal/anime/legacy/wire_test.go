package legacy

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLegacyWireRoundTripsNullableMetadataAndUnknownFields(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-wire","nombre":"Wire","nrocapvisto":2.5,"totalcap":null,"duracion":null,"portada":{"type":"url","path":""},"future":{"nested":true}}`

	var wire LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err != nil {
		t.Fatalf("unmarshal Legacy wire: %v", err)
	}

	encoded, err := json.Marshal(wire)
	if err != nil {
		t.Fatalf("marshal Legacy wire: %v", err)
	}

	assertLegacyJSONEqual(t, payload, encoded)
}

func TestLegacyWireRoundTripsRealNullableFixtureRecord(t *testing.T) {
	t.Parallel()

	path := filepath.Join("..", "..", "..", "resources", "autoreas-data", "animes.dat")
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real fixture not present at %s", path)
		}
		t.Fatalf("open real fixture: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	buffer := make([]byte, 64*1024)
	scanner.Buffer(buffer, 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, `"totalcap":null`) || !strings.Contains(line, `"portada":{`) {
			continue
		}

		var wire LegacyAnimeRaw
		if err := json.Unmarshal([]byte(line), &wire); err != nil {
			t.Fatalf("unmarshal real nullable record: %v", err)
		}
		encoded, err := json.Marshal(wire)
		if err != nil {
			t.Fatalf("marshal real nullable record: %v", err)
		}

		assertLegacyJSONEqual(t, line, encoded)
		return
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan real fixture: %v", err)
	}
	t.Fatal("real fixture has no record with nullable totalcap and object portada")
}

func TestLegacyWireRejectsMalformedNestedRepetition(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"anime-wire","nombre":"Wire","nrocapvisto":2.5,"repetir":[{"estado":"broken"}]}`
	var wire LegacyAnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err == nil {
		t.Fatal("expected malformed nested repetition to fail")
	}
}

func assertLegacyJSONEqual(t *testing.T, want string, got []byte) {
	t.Helper()

	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal wanted JSON: %v", err)
	}
	var gotValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("unmarshal actual JSON: %v", err)
	}
	if !legacyJSONEqual(wantValue, gotValue) {
		t.Fatalf("JSON mismatch\nwant: %s\n got: %s", want, got)
	}
}

func legacyJSONEqual(want any, got any) bool {
	switch wantTyped := want.(type) {
	case map[string]any:
		gotTyped, ok := got.(map[string]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}
		for key, value := range wantTyped {
			if !legacyJSONEqual(value, gotTyped[key]) {
				return false
			}
		}
		return true
	case []any:
		gotTyped, ok := got.([]any)
		if !ok || len(wantTyped) != len(gotTyped) {
			return false
		}
		for index, value := range wantTyped {
			if !legacyJSONEqual(value, gotTyped[index]) {
				return false
			}
		}
		return true
	default:
		return want == got
	}
}
