// Package notice coordinates the episode duration notice.
//
// It decides when an episode is worth measuring and what to do with the answer, and it owns no rule
// of its own: the duration rule lives in internal/anime/duration, the folder reading in
// internal/anime/media, and the delivery in internal/notification. Everything it does is triggered
// from outside — a download that completes, a screen that opens — and nothing is remembered between
// triggers, because the folder belongs to the user and can change at any moment.
package notice

import (
	"context"
	"fmt"
	"path/filepath"
	"strconv"
	"time"

	"autoreas-bridge/internal/anime/duration"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/notification"
)

// TVKind is the stored anime type meaning "Anime (TV)". Every other value, including no stored value
// at all, stays silent: an anime whose type is unknown could be a movie, and announcing a movie as a
// long episode is worse than saying nothing.
const TVKind = 0

// KindEpisodeLong names this notice within the anime source.
const KindEpisodeLong = "anime.episode_long"

// sourceAnime is the bounded context this notice belongs to.
const sourceAnime = "anime"

// Prober obtains the runtime of one media file. It is declared here, by its consumer, so this
// package depends on no particular probe implementation.
type Prober interface {
	// Probe returns the runtime of the file at path, or an error when no reading is possible.
	Probe(ctx context.Context, path string) (time.Duration, error)
}

// Coordinator turns one episode that just landed into at most one notice.
type Coordinator struct {
	inventory *media.Inventory
	prober    Prober
	notifier  notification.Notifier
}

// New returns a Coordinator that reads folders with inventory, measures with prober and delivers
// with notifier.
func New(inventory *media.Inventory, prober Prober, notifier notification.Notifier) *Coordinator {
	return &Coordinator{inventory: inventory, prober: prober, notifier: notifier}
}

// EpisodeLanded reports one episode that just landed in folder, for the anime whose stored type is
// kind. It implements the seam the download context declares.
//
// It returns nothing and never fails: every reason not to speak — a type that cannot qualify, a
// folder nobody can read, a file that cannot be trusted, a missing or unreadable probe — is a
// silence, not an error the caller has to handle.
func (c *Coordinator) EpisodeLanded(ctx context.Context, folder string, kind *int) {
	if !isTV(kind) {
		return
	}

	entries, err := c.inventory.Capture(folder)
	if err != nil {
		// An absent or unreadable folder is a normal state of a filesystem the user owns, and
		// there is simply nothing to say about it.
		return
	}

	landed, ok := landedMedia(entries)
	if !ok {
		return
	}

	runtime, err := c.prober.Probe(ctx, filepath.Join(folder, landed.Basename))
	if err != nil {
		return
	}
	if duration.Classify(runtime) != duration.KindLong {
		return
	}

	c.notify(ctx, landed.Basename, runtime)
}

// isTV reports whether a stored type qualifies for the notice.
func isTV(kind *int) bool {
	return kind != nil && *kind == TVKind
}

// landedMedia returns the file the run just put on disk: the newest media file at the folder root.
//
// The folder is the user's, so this is a reading and not a lookup. The download confirmed an episode
// landed, and the newest file is the one it landed; nothing is remembered between runs.
//
// It refuses to answer when that newest file cannot be trusted — one that could not be described, or
// that changed while it was being listed — because falling back to the next newest file would
// measure a different episode and announce the wrong one.
func landedMedia(entries []identity.Entry) (identity.Entry, bool) {
	var newest identity.Entry
	var newestNs int64
	for _, entry := range entries {
		ns, err := strconv.ParseInt(entry.MtimeNs, 10, 64)
		if err != nil {
			continue
		}
		if ns > newestNs {
			newest, newestNs = entry, ns
		}
	}
	if newestNs <= 0 {
		return identity.Entry{}, false
	}
	if newest.Err != "" || newest.Changed {
		return identity.Entry{}, false
	}
	return newest, true
}

// notify delivers the one notice this package raises. A delivery failure is discarded, never
// propagated: the notifier's own contract isolates adapters, and a notice that could not be shown
// must never fail the download run that produced it.
func (c *Coordinator) notify(ctx context.Context, basename string, runtime time.Duration) {
	if c.notifier == nil {
		return
	}
	_ = c.notifier.Notify(ctx, notification.Notification{
		Title:  "Capítulo inusualmente largo",
		Body:   fmt.Sprintf("%s dura %d minutos", basename, minutes(runtime)),
		Level:  notification.LevelInfo,
		Source: sourceAnime,
		Kind:   KindEpisodeLong,
	})
}

// minutes rounds one measured runtime down to whole minutes, which is the only precision a notice
// needs.
func minutes(runtime time.Duration) int64 {
	return int64(runtime.Round(time.Minute) / time.Minute)
}
