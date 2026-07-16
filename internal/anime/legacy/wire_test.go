package legacy

import (
	"bufio"
	"encoding/json"
	"io"
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

func TestLegacyWireCopiedRealFixtureCoversNullableMetadataVariantMatrix(t *testing.T) {
	sourcePath := filepath.Join("..", "..", "..", "resources", "autoreas-data", "animes.dat")
	source, err := os.Open(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real fixture not present at %s", sourcePath)
		}
		t.Fatalf("open real fixture: %v", err)
	}
	defer source.Close()
	copyPath := filepath.Join(t.TempDir(), "animes.dat")
	copyFile, err := os.Create(copyPath)
	if err != nil {
		t.Fatalf("create copied fixture: %v", err)
	}
	if _, err := io.Copy(copyFile, source); err != nil {
		copyFile.Close()
		t.Fatalf("copy real fixture: %v", err)
	}
	variants := []string{
		`{"_id":"variant-missing","nombre":"Missing","nrocapvisto":0,"unknown":{"keep":true}}`,
		`{"_id":"variant-null","nombre":"Null","nrocapvisto":0,"fechaEstreno":null,"estudios":null,"generos":null,"portada":null,"unknown":{"keep":true}}`,
		`{"_id":"variant-empty","nombre":"Empty","nrocapvisto":0,"estudios":[],"generos":[],"portada":{"type":"url","path":""},"unknown":{"keep":true}}`,
		`{"_id":"variant-values","nombre":"Values","nrocapvisto":0,"fechaEstreno":{"$$date":1710000000123},"estudios":["A"],"generos":["B"],"portada":{"type":"file","path":"cover.jpg","future":{"keep":true}},"unknown":{"keep":true}}`,
	}
	for _, variant := range variants {
		if _, err := copyFile.WriteString("\n" + variant); err != nil {
			copyFile.Close()
			t.Fatalf("append copied fixture variant: %v", err)
		}
	}
	if err := copyFile.Close(); err != nil {
		t.Fatalf("close copied fixture: %v", err)
	}

	file, err := os.Open(copyPath)
	if err != nil {
		t.Fatalf("open copied fixture: %v", err)
	}
	defer file.Close()
	seen := map[string]bool{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, `"_id":"variant-`) {
			continue
		}
		var wire LegacyAnimeRaw
		if err := json.Unmarshal([]byte(line), &wire); err != nil {
			t.Fatalf("unmarshal copied fixture variant: %v", err)
		}
		encoded, err := json.Marshal(wire)
		if err != nil {
			t.Fatalf("marshal copied fixture variant: %v", err)
		}
		assertLegacyJSONEqual(t, line, encoded)
		seen[wire.ID] = true
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan copied fixture: %v", err)
	}
	if len(seen) != len(variants) {
		t.Fatalf("expected every copied fixture variant, got %#v", seen)
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
