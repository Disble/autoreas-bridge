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

// Mark is one Today mark: the NEXT episode number and its measured runtime in whole minutes.
//
// One value so the two facts travel together: a mark carries both, and nil carries neither. That
// co-presence is the whole guarantee, never a proof that the two values agree with each other. The
// ODD 4 Today surface renders it as one chip reading "Ep. 7 · 45 min".
type Mark struct {
	Episode int
	Minutes int
}

// TodayMarks answers one mark per episode, in the same order as the input: a mark when that anime's
// next episode runs long, nil when it does not.
//
// Every row is recomputed from its folder on every call, because the filesystem belongs to the user and
// can change at any moment; nothing is remembered between calls. Rows are measured in parallel within
// maxProbesInFlight, so one slow folder cannot hold up the rest of the day.
func (c *Coordinator) TodayMarks(ctx context.Context, episodes []TodayEpisode) []*Mark {
	marks := make([]*Mark, len(episodes))
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
// Every reason not to mark ends the same way, in nil and never in an error: a type that cannot
// qualify, a folder nobody can read, an identity that abstains, an identity that names a file while
// flagging its own doubt, a probe that cannot read the file, and a runtime that is not long. A mark
// carries the episode number from the identity selection, never from progress arithmetic.
func (c *Coordinator) markOne(ctx context.Context, episode TodayEpisode) *Mark {
	if !isTV(episode.Kind) {
		return nil
	}

	entries, err := c.inventory.Capture(episode.Folder)
	if err != nil {
		return nil
	}

	next, ok := c.nextEpisode(entries, episode.Progress)
	if !ok {
		return nil
	}

	runtime, err := c.prober.Probe(ctx, filepath.Join(episode.Folder, next.Basename))
	if err != nil {
		return nil
	}
	if duration.Classify(runtime) != duration.KindLong {
		return nil
	}
	return &Mark{Episode: next.Episode, Minutes: int(minutes(runtime))}
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
