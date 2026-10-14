// Package announce tells the rest of Bridge that the stored episode durations of an anime changed.
//
// Every duration write marks its anime pending announce in the same transaction. The
// announcer drains those marks: for each pending anime it publishes one
// events.EpisodeDurationsChangedEvent carrying the anime's current snapshot, then clears the mark.
// Only the sync changelog recorder and the WebSocket hub listen, so Mobile receives an ordinary
// update row with the episodes joined in, while the anime itself, its modified_at and the
// AnimeChangedEvent subscribers are never touched (analysis D6).
//
// A mark is cleared only after its event was published, so a crash in between announces it again at
// the next start. The event id is derived from the mark, and the changelog deduplicates on it, so a
// repeat never produces a second row.
package announce

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
)

// logEventType tags every log entry the announcer writes.
const logEventType = "anime.durations_announce"

// Pending reads and clears the announcement marks. The episodes store implements it.
type Pending interface {
	PendingAnnounce(ctx context.Context) ([]episodes.Pending, error)
	ClearPending(ctx context.Context, pending episodes.Pending) error
}

// Snapshots returns the current snapshot bytes of one anime: the same payload an AnimeChangedEvent
// carries. It returns an error wrapping contracts.ErrAnimeNotFound when the anime does not exist.
type Snapshots interface {
	Snapshot(ctx context.Context, animeID string) ([]byte, error)
}

// Deps are the announcer's collaborators. Logger is optional.
type Deps struct {
	Pending   Pending
	Snapshots Snapshots
	Bus       events.Bus
	// Logger receives the failures: a read or clear that failed and a pass that panicked. A
	// failure leaves the mark in place, so the anime is announced on a later pass.
	Logger logger.Logger
	// Parent is the lifetime the passes run under; nil means context.Background(). It must be the
	// same lifetime the changelog recorder writes under: when it ends, the recorder's insert and
	// the announcer's clear fail together, so a mark is never cleared for a row that was never
	// written, and the next start announces it again.
	Parent context.Context
}

// Announcer drains the pending announcement marks in the background.
type Announcer struct {
	deps   Deps
	ctx    context.Context
	cancel context.CancelFunc

	mu      sync.Mutex
	running bool
	repeat  bool
	stopped bool
	idle    chan struct{}
}

// New returns an announcer. Nothing runs until Trigger is called.
func New(deps Deps) *Announcer {
	parent := deps.Parent
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &Announcer{deps: deps, ctx: ctx, cancel: cancel}
}

// EventID is the id of the announcement of one pending mark. It is stable for the mark, so the
// changelog's unique source_event_id turns a repeated announcement into a no-op.
func EventID(pending episodes.Pending) string {
	return fmt.Sprintf("%s:%s:%d", events.EventNameEpisodeDurationsChanged, pending.AnimeID, pending.MarkedAtMS)
}

// Announce runs one pass: every pending anime is announced and its mark cleared, oldest first.
//
// An anime that no longer exists has nothing to announce, so its mark is cleared without an event.
// Any other failure is logged and leaves that mark for a later pass; the other anime still go out.
func (a *Announcer) Announce(ctx context.Context) {
	pending, err := a.deps.Pending.PendingAnnounce(ctx)
	if err != nil {
		a.log(logger.LevelWarn, "duration announcement could not read the pending anime: %v", err)
		return
	}
	for _, mark := range pending {
		if ctx.Err() != nil {
			return
		}
		a.announceOne(ctx, mark)
	}
}

// announceOne publishes one anime's announcement and clears its mark.
func (a *Announcer) announceOne(ctx context.Context, mark episodes.Pending) {
	snapshot, err := a.deps.Snapshots.Snapshot(ctx, mark.AnimeID)
	switch {
	case errors.Is(err, contracts.ErrAnimeNotFound):
		// Nothing to announce: no anime carries these durations.
	case err != nil:
		a.log(logger.LevelWarn, "duration announcement could not read anime %s: %v", mark.AnimeID, err)
		return
	default:
		a.deps.Bus.Publish(events.EpisodeDurationsChangedEvent{
			EventID: EventID(mark),
			AnimeID: mark.AnimeID,
			Payload: snapshot,
		})
	}
	if err := a.deps.Pending.ClearPending(ctx, mark); err != nil {
		a.log(logger.LevelWarn, "duration announcement could not clear anime %s: %v", mark.AnimeID, err)
	}
}

// Trigger starts a pass in the background and returns at once.
//
// One pass runs at a time. A trigger that arrives during a pass queues one repeat, so a burst of
// triggers costs at most one more pass. A trigger after Stop does nothing.
func (a *Announcer) Trigger() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.stopped {
		return
	}
	if a.running {
		a.repeat = true
		return
	}
	a.running = true
	a.idle = make(chan struct{})
	go a.loop(a.idle)
}

// loop runs passes until no repeat is queued or the announcer is stopped, then closes idle.
func (a *Announcer) loop(idle chan struct{}) {
	for {
		a.runRecovered()

		a.mu.Lock()
		if !a.repeat || a.stopped {
			a.running = false
			a.repeat = false
			a.mu.Unlock()
			close(idle)
			return
		}
		a.repeat = false
		a.mu.Unlock()
	}
}

// runRecovered runs one pass. A panic ends that pass only and is logged as an error: the pass runs
// on its own goroutine, where an unrecovered panic would end the whole Bridge process. The marks
// stay, so the next pass announces them.
func (a *Announcer) runRecovered() {
	defer func() {
		if recovered := recover(); recovered != nil {
			a.log(logger.LevelError, "duration announcement pass panicked: %v", recovered)
		}
	}()
	a.Announce(a.ctx)
}

// Wait blocks until no pass is running or queued.
func (a *Announcer) Wait() {
	a.mu.Lock()
	idle, running := a.idle, a.running
	a.mu.Unlock()
	if running {
		<-idle
	}
}

// Stop cancels the running pass, drops any queued repeat, refuses later triggers, and waits for the
// pass to end.
func (a *Announcer) Stop() {
	a.mu.Lock()
	a.stopped = true
	a.mu.Unlock()
	a.cancel()
	a.Wait()
}

// log writes one entry at level when a logger is wired.
func (a *Announcer) log(level, format string, args ...any) {
	if a.deps.Logger == nil {
		return
	}
	a.deps.Logger.Logf("anime", level, logger.Fields{EventType: logEventType}, format, args...)
}
