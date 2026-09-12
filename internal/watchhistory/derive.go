package watchhistory

import "math"

// maxEpisodesPerChange is a safety ceiling, not a measurement: its only job
// is to stop a corrupt float from enumerating an unbounded slice. Any value
// comfortably above real episode counts is equivalent (design.md D2).
const maxEpisodesPerChange = 5000

// Change is one applied anime patch, as watch history needs to see it. The
// two producers (live writes and the one-shot backfill) compute Cycle
// differently, from design.md D3: live is len(MobileAnime.Repetitions)+1;
// the replay anchors backwards, cycle(P) = max(1, R+1-resetsStrictlyAfter(P)).
type Change struct {
	AnimeID        string
	AnimeName      string
	Source         string
	OccurredAtMS   int64
	BeforeEpisodes float64
	AfterEpisodes  float64
	// Cycle is the 1-based rewatch cycle.
	Cycle int64
	// CycleReset is true when the patch that produced this Change carried a
	// repeat (RepeatAt): the episodes watched in the closing cycle are still
	// watched, so this MUST record nothing and retract nothing (design.md D3).
	CycleReset bool
	// SourceActivityID is diagnostic provenance; nil for a live write, set
	// for a row replayed from the audit log.
	SourceActivityID *int64
}

// EffectKind identifies what Derive decided a Change should do to
// watch_history.
type EffectKind uint8

const (
	// EffectNone means no row is inserted or deleted: a zero delta, a
	// half-step with no whole episode reached, a cycle reset, or a guard
	// trip.
	EffectNone EffectKind = iota
	// EffectRecord means every episode in Episodes MUST be inserted,
	// ascending.
	EffectRecord
	// EffectRetract means every row for this anime and cycle above Floor
	// MUST be deleted.
	EffectRetract
)

// Effect is the outcome Derive computes from one Change.
type Effect struct {
	Kind     EffectKind
	Episodes []int64
	Floor    float64
}

// Derive is pure: no clock, no context, no database. It is the single point
// of agreement between the live write paths and the backfill (design.md D2).
// Guard order is significant and MUST NOT be reordered -- see design.md's
// D2 semantics table and its MUTATE guard-mutant table.
func Derive(change Change) Effect {
	if change.CycleReset {
		return Effect{Kind: EffectNone}
	}
	if !isFiniteNonNegativeChange(change) {
		return Effect{Kind: EffectNone}
	}
	if change.AfterEpisodes == change.BeforeEpisodes {
		return Effect{Kind: EffectNone}
	}
	if change.AfterEpisodes < change.BeforeEpisodes {
		return Effect{Kind: EffectRetract, Floor: change.AfterEpisodes}
	}

	floorBefore := int64(math.Floor(change.BeforeEpisodes))
	floorAfter := int64(math.Floor(change.AfterEpisodes))
	if floorAfter-floorBefore > maxEpisodesPerChange {
		return Effect{Kind: EffectNone}
	}
	return Effect{Kind: EffectRecord, Episodes: newlyReachedEpisodes(floorBefore, floorAfter)}
}

// isFiniteNonNegativeChange reports whether both episode values are finite
// and the after value is not negative -- guard 2 of the D2 table.
func isFiniteNonNegativeChange(change Change) bool {
	if math.IsNaN(change.BeforeEpisodes) || math.IsInf(change.BeforeEpisodes, 0) {
		return false
	}
	if math.IsNaN(change.AfterEpisodes) || math.IsInf(change.AfterEpisodes, 0) {
		return false
	}
	return change.AfterEpisodes >= 0
}

// newlyReachedEpisodes returns every whole episode number in the half-open
// interval (floorBefore, floorAfter], ascending. A forward half-step (e.g.
// floor(11) == floor(11.5)) yields none, since half of an episode is not
// one watched.
func newlyReachedEpisodes(floorBefore, floorAfter int64) []int64 {
	if floorAfter <= floorBefore {
		return []int64{}
	}
	episodes := make([]int64, 0, floorAfter-floorBefore)
	for e := floorBefore + 1; e <= floorAfter; e++ {
		episodes = append(episodes, e)
	}
	return episodes
}
