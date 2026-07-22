package store

import (
	"bufio"
	"encoding/json"
	"strings"
	"testing"
)

func TestLegacyWireRoundTripsNullableMetadataAndUnknownFields(t *testing.T) {
	t.Parallel()

	const payload = `{"id":"anime-wire","name":"Wire","episodesWatched":2.5,"totalEpisodes":null,"durationMinutes":null,"cover":{"type":"url","path":""},"future":{"nested":true}}`

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

// TestLegacyWireRoundTripsRealShapeNullableTotalcapAndObjectPortada proves the
// codec round-trips the nullable-totalcap + object-portada combination that
// was historically found in real stored records.
//
// SDD-55 Slice B: resources/autoreas-data/animes.dat (the Legacy append-only
// file, gitignored private user data) is deleted along with the file channel
// -- this test no longer scans that real file at runtime (it would always be
// absent from here on) and instead pins the exact real-shape combination as a
// small, non-identifying synthetic record.
func TestLegacyWireRoundTripsRealShapeNullableTotalcapAndObjectPortada(t *testing.T) {
	t.Parallel()

	const line = `{"id":"anime-real-shape","name":"Real Shape","episodesWatched":1,"totalEpisodes":null,"kind":1,"cover":{"type":"url","path":""}}`

	var wire AnimeRaw
	if err := json.Unmarshal([]byte(line), &wire); err != nil {
		t.Fatalf("unmarshal real-shape record: %v", err)
	}
	encoded, err := json.Marshal(wire)
	if err != nil {
		t.Fatalf("marshal real-shape record: %v", err)
	}

	assertLegacyJSONEqual(t, line, encoded)
}

func TestLegacyWireRejectsMalformedNestedRepetition(t *testing.T) {
	t.Parallel()

	const payload = `{"id":"anime-wire","name":"Wire","episodesWatched":2.5,"repetitions":[{"status":"broken"}]}`
	var wire AnimeRaw
	if err := json.Unmarshal([]byte(payload), &wire); err == nil {
		t.Fatal("expected malformed nested repetition to fail")
	}
}

func TestLegacyWireCoversNullableMetadataVariantMatrix(t *testing.T) {
	variants := []string{
		`{"id":"variant-missing","name":"Missing","episodesWatched":0,"unknown":{"keep":true}}`,
		`{"id":"variant-null","name":"Null","episodesWatched":0,"premieredAt":null,"studios":null,"genres":null,"cover":null,"unknown":{"keep":true}}`,
		`{"id":"variant-empty","name":"Empty","episodesWatched":0,"studios":[],"genres":[],"cover":{"type":"url","path":""},"unknown":{"keep":true}}`,
		`{"id":"variant-values","name":"Values","episodesWatched":0,"premieredAt":1710000000123,"studios":["A"],"genres":["B"],"cover":{"type":"file","path":"cover.jpg","future":{"keep":true}},"unknown":{"keep":true}}`,
	}
	seen := collectLegacyVariantIDs(t, variants)
	if len(seen) != len(variants) {
		t.Fatalf("expected every fixture variant, got %#v", seen)
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

// collectLegacyVariantIDs decodes each variant line and collects its anime ID.
func collectLegacyVariantIDs(t *testing.T, variants []string) map[string]bool {
	t.Helper()

	seen := map[string]bool{}
	scanner := bufio.NewScanner(strings.NewReader(strings.Join(variants, "\n")))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		seen[decodeLegacyVariantID(t, line)] = true
	}
	if err := scanner.Err(); err != nil {
		t.Fatalf("scan fixture variants: %v", err)
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
