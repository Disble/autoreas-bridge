package notice

import (
	"context"
	"slices"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
)

// Recorder keeps the reading of a landed episode as episode data. It is declared here, by its
// consumer; internal/anime/episodes.Store satisfies it, and its contract is to insert only where
// the episode has no stored duration yet (analysis D3), so a landed reading never overwrites one.
type Recorder interface {
	// FillGaps stores each reading whose episode has no row for animeID and reports how many were
	// inserted.
	FillGaps(ctx context.Context, animeID string, readings []episodes.Reading) (int, error)
}

// WithRecorder returns a copy of c that also stores every successful reading of a landed file
// through recorder, for every anime type. A nil recorder keeps the notice-only behaviour.
func (c *Coordinator) WithRecorder(recorder Recorder) *Coordinator {
	withRecorder := *c
	withRecorder.recorder = recorder
	return &withRecorder
}

// record offers one landed reading to the recorder, only when the identity assignment of the
// captured folder gives the landed file exactly the reported episode (the confidence gate of
// analysis section 3): an automatic write is never overwritten, so a wrong pair would stick. A
// write failure is discarded, never propagated, for the same reason a delivery failure is:
// storing a duration must never fail the download run that produced it.
func (c *Coordinator) record(ctx context.Context, animeID string, episode int, runtime time.Duration, entries []identity.Entry, basename string) {
	if c.recorder == nil || !c.assigns(entries, basename, episode) {
		return
	}
	_, _ = c.recorder.FillGaps(ctx, animeID, []episodes.Reading{{Episode: episode, DurationMS: runtime.Milliseconds()}})
}

// assigns reports whether the assignment of entries, with clear numbers only, gives basename
// exactly episode.
func (c *Coordinator) assigns(entries []identity.Entry, basename string, episode int) bool {
	assignment := c.assigner.Assign(identity.Request{Entries: entries, Context: identity.Context{}})
	return slices.Contains(assignment.Assigned, identity.Selection{Episode: episode, Basename: basename})
}
