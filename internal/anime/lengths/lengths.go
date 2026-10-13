// Package lengths is the one read model of stored episode durations: which episodes of an anime run
// long, and whether its next episode does.
//
// Today and the Mobile projection answer the same question, so both read through this package and the
// long rule is applied here and nowhere else; the two can never disagree (analysis section 4). The
// functions are pure: no I/O, no clock. The Today adapter in today.go is the only part that reads.
package lengths

import (
	"math"
	"time"

	"autoreas-bridge/internal/anime/duration"
	"autoreas-bridge/internal/anime/episodes"
)

// TVKind is the stored anime type meaning "Anime (TV)". Only a TV episode can run long: every other
// value, including no stored value at all, could be a movie, and calling a movie a long episode is
// worse than saying nothing.
const TVKind = 0

// Length is one stored episode as its consumers see it: its number, its runtime in whole minutes, and
// whether it runs long.
type Length struct {
	Episode int
	Minutes int
	Long    bool
}

// Mark is one Today mark: the NEXT episode number and its runtime in whole minutes.
//
// One value so the two facts travel together: a mark carries both, and nil carries neither. That
// co-presence is the whole guarantee, never a proof that the two values agree with each other. The
// Today surface renders it as one chip reading "Ep. 7 · 45 min".
type Mark struct {
	Episode int
	Minutes int
}

// EpisodeLengths lists every stored episode of one anime, in the order given, with its whole minutes
// and whether it runs long for an anime of the given stored type.
func EpisodeLengths(durations []episodes.Duration, kind *int) []Length {
	tv := isTV(kind)
	lengths := make([]Length, 0, len(durations))
	for _, stored := range durations {
		runtime := runtimeOf(stored)
		lengths = append(lengths, Length{
			Episode: stored.Episode,
			Minutes: WholeMinutes(runtime),
			Long:    tv && duration.Classify(runtime) == duration.KindLong,
		})
	}
	return lengths
}

// LongNextEpisode returns the mark of an anime whose next episode runs long, or nil.
//
// The next episode is progress + 1 for a whole-number progress, which is the episode the identity
// decision already expected from a folder; a fractional progress names no next episode and gives no
// mark. The episode is looked up by number, so an episode stored before its file exists can be marked.
func LongNextEpisode(durations []episodes.Duration, kind *int, progress float64) *Mark {
	if !isTV(kind) || progress != math.Trunc(progress) {
		return nil
	}
	next := int(progress) + 1
	for _, stored := range durations {
		if stored.Episode != next {
			continue
		}
		runtime := runtimeOf(stored)
		if duration.Classify(runtime) != duration.KindLong {
			return nil
		}
		return &Mark{Episode: next, Minutes: WholeMinutes(runtime)}
	}
	return nil
}

// WholeMinutes rounds one runtime to the nearest whole minute, which is the only precision a mark or a
// notice shows.
func WholeMinutes(runtime time.Duration) int {
	return int(runtime.Round(time.Minute) / time.Minute)
}

// isTV reports whether a stored type can have long episodes.
func isTV(kind *int) bool {
	return kind != nil && *kind == TVKind
}

// runtimeOf converts one stored duration into a runtime.
func runtimeOf(stored episodes.Duration) time.Duration {
	return time.Duration(stored.DurationMS) * time.Millisecond
}
