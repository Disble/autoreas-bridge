package store_test

import (
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/store"
)

// TestNewCanonicalCreateEmitsFullMultiDayArray covers the anime-create-canonical
// spec's "Canonical structural state" requirement: a create with multiple
// placements must emit the full `days` array, with no top-level `section`/
// `orden` fields.
func TestNewCanonicalCreateEmitsFullMultiDayArray(t *testing.T) {
	raw, err := store.NewCanonicalCreate(store.CanonicalCreateInput{
		ID: "multi-day-anime", Title: "Multi Day", SourceURL: "https://example.test/multi-day",
		Days: []store.AnimeDay{
			{Day: "Monday", Order: 1},
			{Day: "Sin ver", Order: 2},
		},
		CreatedAt: time.UnixMilli(1_700_000_000_000).UTC(),
	})
	if err != nil {
		t.Fatalf("NewCanonicalCreate: %v", err)
	}

	payload, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal canonical payload: %v", err)
	}

	if _, ok := fields["section"]; ok {
		t.Fatalf("unexpected top-level section field in payload: %s", payload)
	}
	if _, ok := fields["orden"]; ok {
		t.Fatalf("unexpected top-level orden field in payload: %s", payload)
	}

	var days []struct {
		Day   string  `json:"day"`
		Order float64 `json:"order"`
	}
	if err := json.Unmarshal(fields["days"], &days); err != nil {
		t.Fatalf("unmarshal days: %v", err)
	}
	if len(days) != 2 {
		t.Fatalf("days = %+v, want 2 entries", days)
	}
	if days[0].Day != "Monday" || days[0].Order != 1 {
		t.Fatalf("days[0] = %+v, want Monday/1", days[0])
	}
	if days[1].Day != "Sin ver" || days[1].Order != 2 {
		t.Fatalf("days[1] = %+v, want Sin ver/2", days[1])
	}
}

// TestNewCanonicalCreateRejectsEmptyDays covers "Create without any placement
// is rejected" at the canonical-store layer.
func TestNewCanonicalCreateRejectsEmptyDays(t *testing.T) {
	_, err := store.NewCanonicalCreate(store.CanonicalCreateInput{
		ID: "no-days-anime", Title: "No Days", SourceURL: "https://example.test/no-days",
		CreatedAt: time.UnixMilli(1_700_000_000_000).UTC(),
	})
	if err == nil {
		t.Fatal("expected an error for a create with no placements")
	}
}

// TestNewCanonicalCreateEmitsOptionalUserFields covers sdd-57's follow-up:
// episodesWatched, origin, genres, studios, and an explicit cover all land in
// the canonical snapshot using the same keys the editor save uses, and no
// premieredAt field is ever emitted at create (premiere is an auto lifecycle
// field, stamped only when the first episode is watched).
func TestNewCanonicalCreateEmitsOptionalUserFields(t *testing.T) {
	watched := 3
	raw, err := store.NewCanonicalCreate(store.CanonicalCreateInput{
		ID: "full-optional-anime", Title: "Full Optional", SourceURL: "https://example.test/full-optional",
		Days:            []store.AnimeDay{{Day: "Sin ver", Order: 1}},
		CreatedAt:       time.UnixMilli(1_700_000_000_000).UTC(),
		EpisodesWatched: &watched,
		Origin:          "Japan",
		Genres:          []string{"Action", "Drama"},
		Studios:         []string{"MAPPA"},
		CoverType:       "local",
		CoverPath:       "C:/covers/full-optional.jpg",
	})
	if err != nil {
		t.Fatalf("NewCanonicalCreate: %v", err)
	}

	payload, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal canonical payload: %v", err)
	}

	assertRawField(t, fields, "episodesWatched", `3`)
	assertRawField(t, fields, "origin", `"Japan"`)
	assertRawField(t, fields, "genres", `["Action","Drama"]`)
	assertRawField(t, fields, "studios", `["MAPPA"]`)
	assertRawField(t, fields, "cover", `{"type":"local","path":"C:/covers/full-optional.jpg"}`)
	if _, ok := fields["premieredAt"]; ok {
		t.Fatalf("unexpected premieredAt field at create: %s", payload)
	}
}

// TestNewCanonicalCreateDefaultsEpisodesWatchedAndOmitsUnsetOptionalFields
// covers the nil-optional-fields path: episodesWatched defaults to 0, and
// origin/genres/studios stay entirely absent (not empty) when unset, matching
// the editor codec's "missing" vs "value" discrimination.
func TestNewCanonicalCreateDefaultsEpisodesWatchedAndOmitsUnsetOptionalFields(t *testing.T) {
	raw, err := store.NewCanonicalCreate(store.CanonicalCreateInput{
		ID: "bare-anime", Title: "Bare", SourceURL: "https://example.test/bare",
		Days:      []store.AnimeDay{{Day: "Sin ver", Order: 1}},
		CreatedAt: time.UnixMilli(1_700_000_000_000).UTC(),
	})
	if err != nil {
		t.Fatalf("NewCanonicalCreate: %v", err)
	}

	payload, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal canonical payload: %v", err)
	}

	assertRawField(t, fields, "episodesWatched", `0`)
	assertRawField(t, fields, "cover", `{"type":"url","path":""}`)
	for _, key := range []string{"origin", "genres", "studios", "premieredAt"} {
		if _, ok := fields[key]; ok {
			t.Fatalf("unexpected field %q present when unset: %s", key, payload)
		}
	}
}

// assertRawField verifies one field in a decoded canonical payload.
func assertRawField(t *testing.T, fields map[string]json.RawMessage, key, want string) {
	t.Helper()
	got, ok := fields[key]
	if !ok {
		t.Fatalf("missing field %q in %v", key, fields)
	}
	if string(got) != want {
		t.Fatalf("field %q = %s, want %s", key, got, want)
	}
}
