// Package backfill measures the episodes of active anime that have no stored duration yet.
//
// It is the only way episodes downloaded before durations existed get one (analysis D5), and it
// only fills gaps: a stored duration is never measured again and never overwritten (D3). One pass
// lists the anime, reads each folder, assigns files to episodes with clear numbers only, probes
// the files of the missing episodes outside any transaction, and writes once per anime.
//
// No failure reaches the user: an unreadable folder skips its anime, a failed probe skips its
// episode, and a missing ffprobe ends the pass. Catalog, read and write failures are logged as
// warnings and a recovered panic as an error, through Deps.Logger.
package backfill

import (
	"context"
	"sync"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/identity"
	"autoreas-bridge/internal/logger"
)

// MaxConcurrentProbes bounds how many files one pass probes at a time. Bridge runs other
// background work on the same machine, so the fill stays gentle.
const MaxConcurrentProbes = 2

// Anime is what a pass needs to know about one anime.
type Anime struct {
	// ID identifies the anime.
	ID string
	// Active reports whether the anime is active; only active anime are measured.
	Active bool
	// Folder is the anime's folder; empty means it has none.
	Folder string
}

// Catalog lists the anime a pass may measure.
type Catalog interface {
	// ListAnime returns every anime, active or not.
	ListAnime(ctx context.Context) ([]Anime, error)
}

// Inventory reads the media files of one folder.
type Inventory interface {
	// Capture returns one entry per media file of folder, or an error when it cannot be read.
	Capture(folder string) ([]identity.Entry, error)
}

// Prober obtains the runtime of one media file.
type Prober interface {
	// Probe returns the runtime of the file at path, or an error when no reading is possible.
	Probe(ctx context.Context, path string) (time.Duration, error)
}

// Store reads and fills stored durations. internal/anime/episodes.Store satisfies it.
type Store interface {
	// ByAnime returns the stored durations of one anime.
	ByAnime(ctx context.Context, animeID string) ([]episodes.Duration, error)
	// FillGaps stores the readings whose episode has no row yet.
	FillGaps(ctx context.Context, animeID string, readings []episodes.Reading) (int, error)
}

// Deps wires the ports one Backfill uses.
type Deps struct {
	// Catalog lists the anime.
	Catalog Catalog
	// Inventory reads each folder.
	Inventory Inventory
	// Assigner assigns the files of a folder to episodes.
	Assigner identity.Assigner
	// Prober measures one file.
	Prober Prober
	// Store reads and fills stored durations.
	Store Store
	// Logger receives the failures that are not a silence: a pass that panicked (error), and a
	// catalog or store that failed (warn). Nil logs nothing.
	Logger logger.Logger
}

// Backfill runs fill passes, one at a time, in the background.
type Backfill struct {
	deps   Deps
	ctx    context.Context
	cancel context.CancelFunc

	mu      sync.Mutex
	running bool
	stopped bool
	pending *Scope
	idle    chan struct{}
}

// New returns an idle Backfill over deps.
func New(deps Deps) *Backfill {
	ctx, cancel := context.WithCancel(context.Background())
	return &Backfill{deps: deps, ctx: ctx, cancel: cancel}
}

// Run performs one pass over the active anime in scope and returns when it ends or ctx is done.
// Anime are filled one after another; a missing ffprobe ends the pass at its first probe.
func (b *Backfill) Run(ctx context.Context, scope Scope) {
	list, err := b.deps.Catalog.ListAnime(ctx)
	if err != nil {
		b.log(logger.LevelWarn, "duration backfill could not list the anime: %v", err)
		return
	}
	for _, anime := range list {
		if ctx.Err() != nil {
			return
		}
		if !anime.Active || anime.Folder == "" || !scope.Includes(anime.ID) {
			continue
		}
		if !b.fill(ctx, anime) {
			return
		}
	}
}

// logEventType names every entry this package logs.
const logEventType = "anime.backfill"

// log writes one entry at level when a logger is wired.
func (b *Backfill) log(level, format string, args ...any) {
	if b.deps.Logger == nil {
		return
	}
	b.deps.Logger.Logf("anime", level, logger.Fields{EventType: logEventType}, format, args...)
}
