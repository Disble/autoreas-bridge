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

	var wire AnimeRaw
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
	t.Cleanup(func() { closeLegacyTestFile(t, file) })

	scanner := bufio.NewScanner(file)
	buffer := make([]byte, 64*1024)
	scanner.Buffer(buffer, 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, `"totalcap":null`) || !strings.Contains(line, `"portada":{`) {
			continue
		}

		var wire AnimeRaw
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
	var wire AnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err == nil {
		t.Fatal("expected malformed nested repetition to fail")
	}
}

func TestLegacyWireCopiedRealFixtureCoversNullableMetadataVariantMatrix(t *testing.T) {
	variants := []string{
		`{"_id":"variant-missing","nombre":"Missing","nrocapvisto":0,"unknown":{"keep":true}}`,
		`{"_id":"variant-null","nombre":"Null","nrocapvisto":0,"fechaEstreno":null,"estudios":null,"generos":null,"portada":null,"unknown":{"keep":true}}`,
		`{"_id":"variant-empty","nombre":"Empty","nrocapvisto":0,"estudios":[],"generos":[],"portada":{"type":"url","path":""},"unknown":{"keep":true}}`,
		`{"_id":"variant-values","nombre":"Values","nrocapvisto":0,"fechaEstreno":{"$$date":1710000000123},"estudios":["A"],"generos":["B"],"portada":{"type":"file","path":"cover.jpg","future":{"keep":true}},"unknown":{"keep":true}}`,
	}
	copyPath := copyLegacyFixtureWithVariants(t, variants)
	seen := collectLegacyVariantIDs(t, copyPath)
	if len(seen) != len(variants) {
		t.Fatalf("expected every copied fixture variant, got %#v", seen)
	}
}

// assertLegacyJSONEqual verifies JSON equality while ignoring object key order.
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

// closeLegacyTestFile closes a fixture file and reports failures through testing.T.
func closeLegacyTestFile(t *testing.T, file *os.File) {
	t.Helper()
	if err := file.Close(); err != nil {
		t.Errorf("close test file: %v", err)
	}
}

// legacyJSONEqual recursively compares legacy JSON values.
func legacyJSONEqual(want any, got any) bool {
	if wantObject, gotObject, ok := legacyJSONObjectPair(want, got); ok {
		return legacyJSONObjectEqual(wantObject, gotObject)
	}
	if wantArray, gotArray, ok := legacyJSONArrayPair(want, got); ok {
		return legacyJSONArrayEqual(wantArray, gotArray)
	}
	return want == got
}

// copyLegacyFixtureWithVariants copies the real fixture and appends variants.
func copyLegacyFixtureWithVariants(t *testing.T, variants []string) string {
	t.Helper()

	sourcePath := filepath.Join("..", "..", "..", "resources", "autoreas-data", "animes.dat")
	source, err := os.Open(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("real fixture not present at %s", sourcePath)
		}
		t.Fatalf("open real fixture: %v", err)
	}
	t.Cleanup(func() { closeLegacyTestFile(t, source) })

	copyPath := filepath.Join(t.TempDir(), "animes.dat")
	copyFile, err := os.Create(copyPath)
	if err != nil {
		t.Fatalf("create copied fixture: %v", err)
	}

	if _, err := io.Copy(copyFile, source); err != nil {
		closeLegacyTestFile(t, copyFile)
		t.Fatalf("copy real fixture: %v", err)
	}
	appendLegacyVariants(t, copyFile, variants)
	if err := copyFile.Close(); err != nil {
		t.Fatalf("close copied fixture: %v", err)
	}

	return copyPath
}

// appendLegacyVariants appends JSON variants to a copied fixture file.
func appendLegacyVariants(t *testing.T, copyFile *os.File, variants []string) {
	t.Helper()

	for _, variant := range variants {
		if _, err := copyFile.WriteString("\n" + variant); err != nil {
			closeLegacyTestFile(t, copyFile)
			t.Fatalf("append copied fixture variant: %v", err)
		}
	}
}

// collectLegacyVariantIDs collects IDs from appended fixture variants.
func collectLegacyVariantIDs(t *testing.T, path string) map[string]bool {
	t.Helper()

	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open copied fixture: %v", err)
	}
	t.Cleanup(func() { closeLegacyTestFile(t, file) })

	seen := map[string]bool{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.Contains(line, `"_id":"variant-`) {
			continue
		}
		seen[decodeLegacyVariantID(t, line)] = true
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan copied fixture: %v", err)
	}

	return seen
}

// decodeLegacyVariantID round-trips a variant and returns its anime ID.
func decodeLegacyVariantID(t *testing.T, line string) string {
	t.Helper()

	var wire AnimeRaw
	if err := json.Unmarshal([]byte(line), &wire); err != nil {
		t.Fatalf("unmarshal copied fixture variant: %v", err)
	}
	encoded, err := json.Marshal(wire)
	if err != nil {
		t.Fatalf("marshal copied fixture variant: %v", err)
	}
	assertLegacyJSONEqual(t, line, encoded)

	return wire.ID
}

// legacyJSONObjectPair extracts comparable JSON object values.
func legacyJSONObjectPair(want any, got any) (map[string]any, map[string]any, bool) {
	switch wantTyped := want.(type) {
	case map[string]any:
		gotTyped, ok := got.(map[string]any)
		return wantTyped, gotTyped, ok
	}

	return nil, nil, false
}

// legacyJSONObjectEqual recursively compares JSON objects.
func legacyJSONObjectEqual(want map[string]any, got map[string]any) bool {
	if len(want) != len(got) {
		return false
	}
	for key, value := range want {
		if !legacyJSONEqual(value, got[key]) {
			return false
		}
	}

	return true
}

// legacyJSONArrayPair extracts comparable JSON array values.
func legacyJSONArrayPair(want any, got any) ([]any, []any, bool) {
	wantTyped, ok := want.([]any)
	if !ok {
		return nil, nil, false
	}
	gotTyped, ok := got.([]any)
	if !ok {
		return nil, nil, false
	}

	return wantTyped, gotTyped, true
}

// legacyJSONArrayEqual recursively compares JSON arrays.
func legacyJSONArrayEqual(want []any, got []any) bool {
	if len(want) != len(got) {
		return false
	}
	for index, value := range want {
		if !legacyJSONEqual(value, got[index]) {
			return false
		}
	}

	return true
}
