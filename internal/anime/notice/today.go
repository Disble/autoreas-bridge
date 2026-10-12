package notice

import (
	"context"
	"path/filepath"
	"sync"

	"autoreas-bridge/internal/anime/duration"
	"autoreas-bridge/internal/anime/identity"
)

// maxProbesInFlight bounds how many episodes are measured at the same time.
//
// One probe is an external process, and the cost is process creation rather than reading: measured on
// the reference machine, ffprobe costs 64-86 ms per file flat across a 4.5 GB folder, so eight files
// take 511-631 ms one after another against 261-304 ms at eight abreast. A day can name many anime, and
// an unbounded fan-out would starve a slow or network disk, so four is the deliberate ceiling.
const maxProbesInFlight = 4

// TodayEpisode is what the coordination needs about one anime of the day: where its files are, its
// stored type, and the progress the schedule already carries.
type TodayEpisode struct {
	Folder   string
	Kind     *int
	Progress float64
}

// TodayMarks answers one mark per episode, in the same order as the input: true when that anime's next
// episode runs long.
//
// Every row is recomputed from its folder on every call, because the filesystem belongs to the user and
// can change at any moment; nothing is remembered between calls. Rows are measured in parallel within
// maxProbesInFlight, so one slow folder cannot hold up the rest of the day.
func (c *Coordinator) TodayMarks(ctx context.Context, episodes []TodayEpisode) []bool {
	marks := make([]bool, len(episodes))
	inFlight := make(chan struct{}, maxProbesInFlight)

	var running sync.WaitGroup
	for index, episode := range episodes {
		running.Add(1)
		go func(index int, episode TodayEpisode) {
			defer running.Done()

			inFlight <- struct{}{}
			defer func() { <-inFlight }()

			marks[index] = c.markOne(ctx, episode)
		}(index, episode)
	}
	running.Wait()

	return marks
}

// markOne decides whether one anime of the day deserves a mark.
//
// Every reason not to mark ends the same way, in false and never in an error: a type that cannot
// qualify, a folder nobody can read, an identity that abstains, an identity that names a file while
// flagging its own doubt, a probe that cannot read the file, and a runtime that is not long.
func (c *Coordinator) markOne(ctx context.Context, episode TodayEpisode) bool {
	if !isTV(episode.Kind) {
		return false
	}

	entries, err := c.inventory.Capture(episode.Folder)
	if err != nil {
		return false
	}

	next, ok := c.nextEpisode(entries, episode.Progress)
	if !ok {
		return false
	}

	runtime, err := c.prober.Probe(ctx, filepath.Join(episode.Folder, next.Basename))
	if err != nil {
		return false
	}
	return duration.Classify(runtime) == duration.KindLong
}

// nextEpisode asks the identity decision which file is next, and refuses an answer that arrived with
// ambiguity: naming an episode nobody can be sure about is worse than showing no mark at all.
func (c *Coordinator) nextEpisode(entries []identity.Entry, progress float64) (identity.Selection, bool) {
	result := c.identifier.Identify(identity.Request{
		Entries: entries,
		Context: identity.ContextForProgress(progress),
	})
	if result.Next == nil || hasAmbiguity(result.Diagnostics) {
		return identity.Selection{}, false
	}
	return *result.Next, true
}

// hasAmbiguity reports whether the identity named a file while flagging its own doubt about it.
func hasAmbiguity(diagnostics []identity.Diagnostic) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Kind == identity.DiagnosticAmbiguity {
			return true
		}
	}
	return false
}
