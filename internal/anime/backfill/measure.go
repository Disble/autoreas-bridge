package backfill

import (
	"context"
	"path/filepath"
	"sync"
	"sync/atomic"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/logger"
)

// fill measures the missing episodes of one anime and stores their readings in one write. It
// reports false when the pass must end because the probe binary is missing.
//
// The stored rows are read first and the files are probed afterwards, outside any transaction:
// the bridge database has one connection, and a probe can take seconds.
func (b *Backfill) fill(ctx context.Context, anime Anime) bool {
	stored, err := b.deps.Store.ByAnime(ctx, anime.ID)
	if err != nil {
		b.log(logger.LevelWarn, "duration backfill could not read the durations of anime %s: %v", anime.ID, err)
		return true
	}
	entries, err := b.deps.Inventory.Capture(anime.Folder)
	if err != nil {
		// An absent or unreadable folder is a normal state of a folder the user owns.
		return true
	}
	// An empty Context assigns clear numbers only: an automatic path never infers an episode.
	assignment := b.deps.Assigner.Assign(identity.Request{Entries: entries, Context: identity.Context{}})
	readings, available := b.measure(ctx, anime.Folder, missing(assignment.Assigned, stored))
	if len(readings) > 0 {
		// A write failure leaves the gaps for the next pass, which is the same as not measuring.
		if _, err := b.deps.Store.FillGaps(ctx, anime.ID, readings); err != nil {
			b.log(logger.LevelWarn, "duration backfill could not store the durations of anime %s: %v", anime.ID, err)
		}
	}
	return available
}

// missing returns the assigned files whose episode has no stored duration.
func missing(assigned []identity.Selection, stored []episodes.Duration) []identity.Selection {
	have := make(map[int]bool, len(stored))
	for _, row := range stored {
		have[row.Episode] = true
	}
	var out []identity.Selection
	for _, selection := range assigned {
		if !have[selection.Episode] {
			out = append(out, selection)
		}
	}
	return out
}

// measure probes the files of targets, at most MaxConcurrentProbes at a time, and returns the
// readings in target order. A failed probe yields no reading. It reports false when the probe
// binary is missing, after which no further file is started; cancellation also stops new starts.
func (b *Backfill) measure(ctx context.Context, folder string, targets []identity.Selection) ([]episodes.Reading, bool) {
	results := make([]episodes.Reading, len(targets))
	var (
		wg          sync.WaitGroup
		unavailable atomic.Bool
		slots       = make(chan struct{}, MaxConcurrentProbes)
	)
	// mayStart takes a slot, waiting for one to free, and reports whether a new probe may start.
	// A refused slot is never given back: no probe starts after a refusal, and slots is discarded.
	mayStart := func() bool {
		slots <- struct{}{}
		return ctx.Err() == nil && !unavailable.Load()
	}
	for i := 0; i < len(targets) && mayStart(); i++ {
		target := targets[i]
		wg.Add(1)
		go func() {
			defer func() { <-slots; wg.Done() }()
			runtime, err := b.deps.Prober.Probe(ctx, filepath.Join(folder, target.Basename))
			if err != nil {
				if probeUnavailable(err) {
					unavailable.Store(true)
				}
				return
			}
			results[i] = episodes.Reading{Episode: target.Episode, DurationMS: runtime.Milliseconds()}
		}()
	}
	wg.Wait()

	readings := make([]episodes.Reading, 0, len(results))
	for _, reading := range results {
		// A zero reading is a failed probe or a runtime below one millisecond, which is no
		// duration; storing it would make the store refuse the whole anime.
		if reading.DurationMS > 0 {
			readings = append(readings, reading)
		}
	}
	return readings, !unavailable.Load()
}

// probeUnavailable reports whether a probe failed because its binary could not be resolved (see
// probe.Unavailable). On Windows an absolute path that already has an extension fails as
// *fs.PathError instead and is treated as a per-file failure: the pass probes every file and stores
// nothing.
func probeUnavailable(err error) bool {
	return probe.Unavailable(err)
}
