package watchhistory

import (
	"math"
	"reflect"
	"testing"
)

// TestDeriveGuardOrder exercises every guard of the D2 semantics table, in
// evaluation order, plus the multi-episode jump cases design.md's worked
// examples pin exactly. The safety-ceiling case asserts against 5001 (one
// past the ceiling) as a literal, never against the production
// maxEpisodesPerChange constant.
func TestDeriveGuardOrder(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		change Change
		want   Effect
	}{
		{
			name:   "a cycle reset records and retracts nothing",
			change: Change{BeforeEpisodes: 11, AfterEpisodes: 0, CycleReset: true},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "a NaN before value is a no-op",
			change: Change{BeforeEpisodes: math.NaN(), AfterEpisodes: 5},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "an infinite after value is a no-op",
			change: Change{BeforeEpisodes: 1, AfterEpisodes: math.Inf(1)},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "a negative after value is a no-op",
			change: Change{BeforeEpisodes: 1, AfterEpisodes: -1},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "an equal before and after value is a no-op",
			change: Change{BeforeEpisodes: 5, AfterEpisodes: 5},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "a backward step retracts above the new floor",
			change: Change{BeforeEpisodes: 12, AfterEpisodes: 11},
			want:   Effect{Kind: EffectRetract, Floor: 11},
		},
		{
			name:   "a fractional backward step retracts above the fractional floor",
			change: Change{BeforeEpisodes: 11, AfterEpisodes: 10.5},
			want:   Effect{Kind: EffectRetract, Floor: 10.5},
		},
		{
			// 5001 is one past the safety ceiling. Written as a literal on
			// purpose -- never assert against the production constant being
			// pinned (CLAUDE.md #16, design.md's MUTATE table).
			name:   "a step past the safety ceiling is a no-op",
			change: Change{BeforeEpisodes: 0, AfterEpisodes: 5001},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "a multi-episode jump enumerates every newly reached episode",
			change: Change{BeforeEpisodes: 2, AfterEpisodes: 5},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{3, 4, 5}},
		},
		{
			name:   "a fractional jump enumerates only whole episodes",
			change: Change{BeforeEpisodes: 10.5, AfterEpisodes: 13},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{11, 12, 13}},
		},
		{
			name:   "a forward half-step records nothing",
			change: Change{BeforeEpisodes: 11, AfterEpisodes: 11.5},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{}},
		},
		{
			name:   "finishing a half-watched episode records it once",
			change: Change{BeforeEpisodes: 10.5, AfterEpisodes: 11},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{11}},
		},
		{
			name:   "the ordinary single-episode forward step",
			change: Change{BeforeEpisodes: 10, AfterEpisodes: 11},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{11}},
		},
		{
			// The ceiling guard MUST compare the DIFFERENCE of the floors,
			// never their sum: at a non-zero floor a sum comparison would
			// reject an ordinary +1 step (kills an Arithmetic mutant that
			// swaps the subtraction for addition).
			name:   "the ceiling guard compares the difference of the floors, not their sum",
			change: Change{BeforeEpisodes: 3000, AfterEpisodes: 3001},
			want:   Effect{Kind: EffectRecord, Episodes: []int64{3001}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := Derive(tc.change)
			if got.Kind != tc.want.Kind {
				t.Fatalf("Kind = %v, want %v", got.Kind, tc.want.Kind)
			}
			if got.Kind == EffectRetract && got.Floor != tc.want.Floor {
				t.Fatalf("Floor = %v, want %v", got.Floor, tc.want.Floor)
			}
			if got.Kind == EffectRecord && !reflect.DeepEqual(got.Episodes, tc.want.Episodes) {
				t.Fatalf("Episodes = %v, want %v", got.Episodes, tc.want.Episodes)
			}
		})
	}
}

// TestDeriveRecordsExactlyAtTheSafetyCeiling asserts a step of exactly 5000
// newly reached episodes still records (the ceiling guard is "greater
// than", not "greater than or equal to"). 5000 is written as a literal:
// never assert against the production maxEpisodesPerChange constant being
// pinned.
func TestDeriveRecordsExactlyAtTheSafetyCeiling(t *testing.T) {
	t.Parallel()

	got := Derive(Change{BeforeEpisodes: 0, AfterEpisodes: 5000})
	if got.Kind != EffectRecord {
		t.Fatalf("Kind = %v, want EffectRecord", got.Kind)
	}
	if len(got.Episodes) != 5000 {
		t.Fatalf("expected exactly 5000 episodes, got %d", len(got.Episodes))
	}
	if got.Episodes[0] != 1 || got.Episodes[len(got.Episodes)-1] != 5000 {
		t.Fatalf("expected episodes 1..5000, got first=%d last=%d", got.Episodes[0], got.Episodes[len(got.Episodes)-1])
	}
}

// TestIsFiniteNonNegativeChangeRejectsInfiniteOnEitherSide directly
// exercises the unexported guard-2 helper (white-box, same package) rather
// than through Derive: an infinite Before value has no protective fallback
// downstream (unlike After, whose final ">= 0" comparison already rejects
// NaN and -Inf on its own), so it must be caught here explicitly, in both
// signs.
func TestIsFiniteNonNegativeChangeRejectsInfiniteOnEitherSide(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		change Change
	}{
		{name: "positive infinite before", change: Change{BeforeEpisodes: math.Inf(1), AfterEpisodes: 5}},
		{name: "negative infinite before", change: Change{BeforeEpisodes: math.Inf(-1), AfterEpisodes: 5}},
		{name: "positive infinite after", change: Change{BeforeEpisodes: 5, AfterEpisodes: math.Inf(1)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if isFiniteNonNegativeChange(tc.change) {
				t.Fatalf("expected isFiniteNonNegativeChange(%+v) to be false", tc.change)
			}
		})
	}
}
