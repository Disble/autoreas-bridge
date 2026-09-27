package store_test

import (
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
)

// TestNewEditorRawMutationDerivesFirstWatchPremiere pins the raw editor mutator
// directly: it derives premieredAt only on a still-undated zero-to-positive
// progress transition, and a manual premiere mutation is ignored.
func TestNewEditorRawMutationDerivesFirstWatchPremiere(t *testing.T) {
	const stamped = int64(1600000000000)

	tests := []struct {
		name          string
		seed          string
		patch         store.EditorMutation
		wantPremiered *int64
		nilCurrent    bool
	}{
		{
			name:          "zero to positive derives the save instant",
			seed:          `{"id":"anime-1","episodesWatched":0}`,
			patch:         store.EditorMutation{Progress: new(1.0)},
			wantPremiered: new(int64(1710000000123)),
		},
		{
			name:          "zero to positive keeps an already recorded date",
			seed:          `{"id":"anime-1","episodesWatched":0,"premieredAt":1600000000000}`,
			patch:         store.EditorMutation{Progress: new(1.0)},
			wantPremiered: new(stamped),
		},
		{
			name:  "legacy positive undated stays undated",
			seed:  `{"id":"anime-1","episodesWatched":2}`,
			patch: store.EditorMutation{Progress: new(3.0)},
		},
		{
			name:          "recorded date is preserved",
			seed:          `{"id":"anime-1","episodesWatched":3,"premieredAt":1600000000000}`,
			patch:         store.EditorMutation{Progress: new(4.0)},
			wantPremiered: new(stamped),
		},
		{
			name:  "manual premieredAt is ignored",
			seed:  `{"id":"anime-1","episodesWatched":2}`,
			patch: store.EditorMutation{PremieredAt: store.NullableTimeMutation{Present: true, UnixMilli: 1500000000000}},
		},
		{
			name:       "a nil pre-state cannot derive a date",
			seed:       `{"id":"anime-1","episodesWatched":0}`,
			patch:      store.EditorMutation{Progress: new(1.0)},
			nilCurrent: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assertEditorRawFirstWatchPremiere(t, tc.seed, tc.patch, tc.nilCurrent, tc.wantPremiered)
		})
	}
}

// assertEditorRawFirstWatchPremiere runs one raw editor mutation and checks the
// derived first-watch instant, kept as a helper so the table stays below the
// cognitive complexity gate.
func assertEditorRawFirstWatchPremiere(t *testing.T, seed string, patch store.EditorMutation, nilCurrent bool, wantPremiered *int64) {
	t.Helper()
	now := time.UnixMilli(1710000000123).UTC()
	raw, current, _, err := store.DecodeForUpdate([]byte(seed))
	if err != nil {
		t.Fatalf("decode seed: %v", err)
	}
	var currentArg *domain.Anime
	if !nilCurrent {
		currentArg = &current
	}
	if err := store.NewEditorRawMutation(patch, now)(&raw, currentArg); err != nil {
		t.Fatalf("mutate: %v", err)
	}
	payload, err := raw.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal fields: %v", err)
	}
	got := fields["premieredAt"]
	if wantPremiered == nil {
		if len(got) > 0 && string(got) != "null" {
			t.Fatalf("expected no premieredAt, got %s", got)
		}
		return
	}
	var millis int64
	if err := json.Unmarshal(got, &millis); err != nil {
		t.Fatalf("unmarshal premieredAt %s: %v", got, err)
	}
	if millis != *wantPremiered {
		t.Fatalf("expected premieredAt %d, got %d", *wantPremiered, millis)
	}
}
