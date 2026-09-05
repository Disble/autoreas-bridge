package handlers

import (
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

func TestDecodePendingOperationPatch(t *testing.T) {
	t.Parallel()

	for _, tt := range pendingOperationPatchCases {
		tc := tt
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := decodePendingOperationPatch(tc.op)
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("decode pending operation patch: %v", err)
			}
			if !equalAnimePatch(got, tc.want) {
				t.Fatalf("expected patch %#v, got %#v", tc.want, got)
			}
		})
	}
}

var pendingOperationPatchCases = []struct {
	name    string
	op      contracts.PendingOperation
	want    AnimePatch
	wantErr string
}{
	{"maps valid payload", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"status": float64(2), "episodesWatched": float64(10.5), "lastWatchedAt": float64(1710000000123), "days": []any{"Lunes", "Miercoles"}}}, AnimePatch{Estado: new(2), NroCapVisto: new(10.5), FechaUltCapVisto: new(int64(1710000000123)), Dias: []string{"Lunes", "Miercoles"}}, ""},
	{"round-trips explicit base token", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"episodesWatched": float64(10.5), "base": float64(1710000000123)}}, AnimePatch{NroCapVisto: new(10.5), Base: new(int64(1710000000123))}, ""},
	{"round-trips explicit zero base token", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"episodesWatched": float64(10.5), "base": float64(0)}}, AnimePatch{NroCapVisto: new(10.5), Base: new(int64(0))}, ""},
	{"base omitted decodes to nil", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"episodesWatched": float64(10.5)}}, AnimePatch{NroCapVisto: new(10.5)}, ""},
	{"rejects missing anime id", contracts.PendingOperation{Operation: "update", Payload: map[string]any{"episodesWatched": float64(1)}}, AnimePatch{}, "missing anime id"},
	{"rejects invalid payload", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"episodesWatched": -1}}, AnimePatch{}, "invalid nrocapvisto"},
	{"rejects stale Spanish-only key (SDD-56 hard cutover)", contracts.PendingOperation{AnimeID: "anime-1", Operation: "update", Payload: map[string]any{"estado": float64(1)}}, AnimePatch{}, "renamed"},
}

// equalAnimePatch compares all fields of two decoded anime patches.
func equalAnimePatch(got, want AnimePatch) bool {
	if !equalIntPointers(got.Estado, want.Estado) {
		return false
	}
	if !equalFloatPointers(got.NroCapVisto, want.NroCapVisto) {
		return false
	}
	if !equalInt64Pointers(got.FechaUltCapVisto, want.FechaUltCapVisto) {
		return false
	}
	if !equalInt64Pointers(got.Base, want.Base) {
		return false
	}
	if len(got.Dias) != len(want.Dias) {
		return false
	}
	for index := range got.Dias {
		if got.Dias[index] != want.Dias[index] {
			return false
		}
	}
	return true
}

// equalIntPointers compares optional integer values.
func equalIntPointers(got, want *int) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

// equalFloatPointers compares optional floating-point values.
func equalFloatPointers(got, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}

// equalInt64Pointers compares optional int64 values.
func equalInt64Pointers(got, want *int64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}
	return *got == *want
}
