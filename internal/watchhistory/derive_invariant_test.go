package watchhistory

import (
	"maps"
	"math/rand"
	"slices"
	"testing"
)

// TestDeriveMaintainsD2aInvariantAcrossRandomWalks runs Derive over
// pseudo-random forward/backward walks and asserts the simulated recorded
// set always equals exactly (0, progress] -- the D2a invariant (design.md
// D3) that keeps watch_history from drifting off Derive's guard order. Do
// not change the seed, deltas, trial count, or step count: they are what
// make the walk reach After == 0, the only case that kills two mutants on
// derive.go:91's "AfterEpisodes >= 0" boundary.
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
					trial, step, slices.Sorted(maps.Keys(recorded)), firstFloor, current)
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
