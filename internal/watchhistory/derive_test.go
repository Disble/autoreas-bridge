package watchhistory

import (
	"math"
	"reflect"
	"testing"
)

// deriveCase is one row of TestDeriveGuardOrder's table.
type deriveCase struct {
	name string
	// wantLanding is the instant the highest newly reached episode must carry.
	// Every row that does not set ReportedAtMS or OccurredAtMS leaves it at
	// zero, so the assertion also proves the fallback is not silently inventing
	// a value.
	wantLanding int64
	change      Change
	want        Effect
}

// assertDeriveCase checks one row's Effect against its expectation. It takes the
// whole row so the table's loop stays under gocognit's limit, the same shape
// store_test.go's assertStepSequence uses.
func assertDeriveCase(t *testing.T, tc deriveCase) {
	t.Helper()
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
	if got.Kind == EffectRecord && got.LandingAtMS != tc.wantLanding {
		t.Fatalf("LandingAtMS = %d, want %d", got.LandingAtMS, tc.wantLanding)
	}
}

// TestDeriveGuardOrder exercises every guard of the D2 semantics table, in
// evaluation order, plus the multi-episode jump cases design.md's worked
// examples pin exactly. Guard 2 (isFiniteNonNegativeChange) rejects NaN and
// infinite values on either side of the change.
func TestDeriveGuardOrder(t *testing.T) {
	t.Parallel()

	cases := []deriveCase{
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
			// Before has no protective fallback further down the guard
			// chain (unlike After, whose own ">= 0" comparison already
			// rejects NaN/-Inf), so guard 2 must catch it explicitly.
			name:   "a positive infinite before value is a no-op",
			change: Change{BeforeEpisodes: math.Inf(1), AfterEpisodes: 5},
			want:   Effect{Kind: EffectNone},
		},
		{
			name:   "a negative infinite before value is a no-op",
			change: Change{BeforeEpisodes: math.Inf(-1), AfterEpisodes: 5},
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
			// 5001 is one past the safety ceiling, written as a literal
			// (CLAUDE.md #16) so mutating maxEpisodesPerChange doesn't pass
			// unnoticed.
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
			// SDD-73: a usable reported instant becomes the landing instant,
			// even when it is far earlier than the observation (an offline
			// phone syncing hours later).
			name:        "a usable reported instant becomes the landing instant",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: 1000},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 1000,
		},
		{
			// The smallest accepted report, asserted at the edge: the rule is
			// "strictly positive", so the boundary belongs in the table rather
			// than left to whatever magnitude happens to look plausible.
			name:        "the smallest positive reported instant is accepted",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: 1},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 1,
		},
		{
			// reported > 0 is the floor: epoch zero is never a real watch time,
			// so a zero report must be treated as no report at all.
			name:        "a zero reported instant falls back to the observation instant",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: 0},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 2000,
		},
		{
			name:        "a negative reported instant falls back to the observation instant",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: -5},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 2000,
		},
		{
			// An untrusted device clock must never write a future row.
			name:        "a reported instant later than the observation instant falls back",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: 2001},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 2000,
		},
		{
			name:        "a reported instant earlier than the observation instant is used",
			change:      Change{BeforeEpisodes: 8, AfterEpisodes: 9, OccurredAtMS: 2000, ReportedAtMS: 1999},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{9}},
			wantLanding: 1999,
		},
		{
			// A jump exposes ONE landing instant; attributing it to the highest
			// episode only is the store's job (store_test.go).
			name:        "a jump exposes the landing instant for its highest episode",
			change:      Change{BeforeEpisodes: 6, AfterEpisodes: 8, OccurredAtMS: 2000, ReportedAtMS: 1000},
			want:        Effect{Kind: EffectRecord, Episodes: []int64{7, 8}},
			wantLanding: 1000,
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
			assertDeriveCase(t, tc)
		})
	}
}

// TestIsFiniteNonNegativeChangeRejectsPositiveInfiniteAfter pins the explicit
// +Inf After check, which Derive cannot expose: int64(math.Floor(+Inf))
// overflows on amd64 and the 5000 ceiling guard returns EffectNone anyway,
// so a Derive row passes with this check removed. Only a direct call kills
// that mutant.
func TestIsFiniteNonNegativeChangeRejectsPositiveInfiniteAfter(t *testing.T) {
	t.Parallel()

	if isFiniteNonNegativeChange(Change{BeforeEpisodes: 5, AfterEpisodes: math.Inf(1)}) {
		t.Fatal("expected a positive infinite After value to be rejected")
	}
}

// TestDeriveRecordsExactlyAtTheSafetyCeiling asserts a step of exactly 5000
// newly reached episodes still records (the ceiling guard is strictly
// greater-than). 5000 is a literal, not the maxEpisodesPerChange constant.
// Left standalone rather than folded into TestDeriveGuardOrder: expressing
// a 5000-episode expectation as a row would need its own one-call
// generator, which is the cost this refactor exists to avoid.
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
