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
