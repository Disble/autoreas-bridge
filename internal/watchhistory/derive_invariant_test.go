package watchhistory

import (
	"math/rand"
	"sort"
	"testing"
)

// TestDeriveMaintainsD2aInvariantAcrossRandomWalks exercises Derive over
// many pseudo-random forward/backward sequences (never a cycle reset, which
// is scoped by a dedicated guard test) and asserts, after every step, that
// the simulated recorded set for one (anime, cycle) equals exactly the
// integers in (0, progress] -- the D2a invariant that keeps the
// watch_history projection from ever drifting from its authority. Every
// cycle's firstObservedFloor is 0 (a cycle always starts at zero progress,
// design.md D3), so progress never legitimately regresses below it; the
// walk is clamped at 0 for the same reason. This is expected to pass with
// no production code beyond Derive's existing guard order (design.md's
// Open Questions / task 1.2.4): a failure here means the defect is in
// Derive, not in this test.
func TestDeriveMaintainsD2aInvariantAcrossRandomWalks(t *testing.T) {
	t.Parallel()

	const firstFloor = int64(0)
	deltas := []float64{1, 0.5, 2, 5, -1, -0.5, -3, 0}
	rng := rand.New(rand.NewSource(42))

	for trial := range 20 {
		recorded := map[int64]bool{}
		var current float64

		for step := range 15 {
			next := current + deltas[rng.Intn(len(deltas))]
			if next < 0 {
				next = 0
			}
			effect := Derive(Change{BeforeEpisodes: current, AfterEpisodes: next})
			applyEffectToSimulatedSet(recorded, effect)
			current = next

			if !recordedSetMatchesD2aInvariant(recorded, firstFloor, current) {
				t.Fatalf("trial %d step %d: recorded set %v violates the D2a invariant for firstFloor=%d progress=%v",
					trial, step, sortedInt64Keys(recorded), firstFloor, current)
			}
		}
	}
}

// applyEffectToSimulatedSet mutates a simulated recorded-episode set the
// same way the real store's ApplyTx would mutate the table.
func applyEffectToSimulatedSet(recorded map[int64]bool, effect Effect) {
	switch effect.Kind {
	case EffectRecord:
		for _, episode := range effect.Episodes {
			recorded[episode] = true
		}
	case EffectRetract:
		for episode := range recorded {
			if float64(episode) > effect.Floor {
				delete(recorded, episode)
			}
		}
	}
}

// recordedSetMatchesD2aInvariant reports whether recorded holds exactly the
// integers in (firstFloor, progress].
func recordedSetMatchesD2aInvariant(recorded map[int64]bool, firstFloor int64, progress float64) bool {
	wantCount := 0
	for e := firstFloor + 1; float64(e) <= progress; e++ {
		wantCount++
		if !recorded[e] {
			return false
		}
	}
	return len(recorded) == wantCount
}

// sortedInt64Keys returns a set's keys in ascending order, for readable
// failure output.
func sortedInt64Keys(set map[int64]bool) []int64 {
	keys := make([]int64, 0, len(set))
	for k := range set {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	return keys
}
