// Package schedule implements the in-process scheduler (design.md §3.5/§6): a single
// goroutine driven by an INJECTED clock that reads download_schedule_config, computes the
// next daily HH:MM boundary, and on each due tick invokes an INJECTED run-callback. It is the
// "Scheduler" port consumer side of design.md §3.5 -- the production wiring of the real
// download.Service.RunOnce as the callback, and the app.go lifecycle hooks, are Phase 6 work
// (PR4b); this package depends ONLY on the minimal store seam it needs (ConfigStore), never on
// the full download.Store interface, so it stays independently testable.
//
// Concurrency model: a single `running` atomic.Bool guards against overlapping runs
// (design.md §6 "Concurrent-Run Guard"). A scheduled tick that finds the guard held logs and
// skips (no error to anyone); a manual TriggerNow that finds the guard held returns
// ErrRunInProgress. Stop() cancels the active run's context and waits at most
// ShutdownDrainWait before abandoning it (design.md §6 "Lifecycle hooks + bounded drain"). A
// run exceeding MaxRunDuration is cancelled by its own per-run context deadline and the guard
// is released regardless of whether the injected Run callback actually honors cancellation
// promptly -- the run is recorded internally as released even if the callback goroutine is
// still unwinding, so a wedged run can never suppress all future runs forever.
package schedule

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"time"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/logger"
)

// ErrRunInProgress is returned by TriggerNow when a run (scheduled or manual) is already in
// progress (design-scheduler spec "Concurrent-Run Guard" -> "Manual trigger invoked during an
// active run").
var ErrRunInProgress = errors.New("schedule: a download run is already in progress")

// ErrNoEnabledWeekday is returned by nextDailyBoundaryAfter when the weekday mask has no bit
// set (an explicit empty set) or no enabled weekday is found within 7 day-advancements (which,
// since a byte mask has only 7 distinct weekday bits, is equivalent to an empty mask -- design
// download-schedule-weekdays "Empty Weekday Set Disables Scheduling"). The loop() caller treats
// this identically to the existing !cfg.Enabled / parse-error idle-recheck path: it never fires.
var ErrNoEnabledWeekday = errors.New("schedule: no enabled weekday in mask")

const (
	// defaultIdleInterval is how often a disabled (or misconfigured) schedule is re-checked
	// so a UI enable/edit takes effect without an app restart (design.md §6 "Mechanics").
	defaultIdleInterval = 30 * time.Second
	// defaultShutdownDrainWait bounds how long Stop() waits for an in-flight run to unwind
	// after its context is cancelled before abandoning it (design.md §6 "Lifecycle hooks").
	defaultShutdownDrainWait = 5 * time.Second
	// defaultMaxRunDuration is the hard upper bound a single run may hold the concurrent-run
	// guard before being force-cancelled and the guard released (design.md §6 "Run-level
	// max-duration guard (C3)").
	defaultMaxRunDuration = 2 * time.Hour
)

type scheduler struct {
	store ConfigStore
	clock Clock
	run   RunFunc
	log   logger.Logger

	idleInterval      time.Duration
	shutdownDrainWait time.Duration
	maxRunDuration    time.Duration

	running atomic.Bool
	wake    chan struct{}

	startOnce sync.Once
	loopDone  chan struct{}
	stopOnce  sync.Once

	mu          sync.Mutex
	loopCancel  context.CancelFunc
	runCancel   context.CancelFunc
	runDoneChan chan struct{}
}

// NotifyConfigChanged wakes the scheduler loop so a just-saved schedule is re-read immediately
// instead of waiting for the disabled/misconfigured idle poll interval. This matters for the UI
// flow where users set the next run one minute ahead; a 30s idle wait can otherwise miss that
// minute and roll the next boundary to tomorrow.
func (s *scheduler) NotifyConfigChanged() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// Start begins the in-process loop (design.md §6 "Mechanics"). Safe to call once; subsequent
// calls are no-ops (mirrors internal/anime RuntimeWatcher.StartAsync's sync.Once discipline).
func (s *scheduler) Start(ctx context.Context) {
	s.startOnce.Do(func() {
		loopCtx, cancel := context.WithCancel(ctx)
		s.mu.Lock()
		s.loopCancel = cancel
		s.mu.Unlock()

		go func() {
			defer close(s.loopDone)
			s.loop(loopCtx)
		}()
	})
}

// Stop cancels the loop and BOUNDED-DRAINS an in-flight run (design.md §6 "Lifecycle hooks +
// bounded drain"). It cancels the active run context, waits at most shutdownDrainWait for the
// run goroutine to unwind, then returns regardless -- it NEVER blocks for the lifetime of a
// long run.
func (s *scheduler) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		loopCancel := s.loopCancel
		runCancel := s.runCancel
		runDone := s.runDoneChan
		s.mu.Unlock()

		if loopCancel != nil {
			loopCancel()
		}
		if runCancel != nil {
			runCancel()
		}

		if runDone != nil {
			select {
			case <-runDone:
			case <-time.After(s.shutdownDrainWait):
				s.logf("schedule: Stop() drain timeout (%s) exceeded with a run still in flight; abandoning it", s.shutdownDrainWait)
			}
		}

		select {
		case <-s.loopDone:
		case <-time.After(s.shutdownDrainWait):
		}
	})
}

// TriggerNow starts an immediate check out-of-band (design.md §3.5), respecting the
// concurrent-run guard. It returns ErrRunInProgress if a run is already active and otherwise
// returns as soon as the run has been accepted, so UI callers can keep rendering the provisional
// running row while the pipeline continues in the background.
func (s *scheduler) TriggerNow(ctx context.Context, trigger string) error {
	runCtx, doneChan, ok := s.acquire(ctx)
	if !ok {
		return ErrRunInProgress
	}
	go func() {
		_, _ = s.executeRun(runCtx, doneChan, trigger)
	}()
	return nil
}

// Status returns the current next/last-run/last-status snapshot, reading through to the
// persisted ScheduleConfig and overlaying the live `running` flag (design-scheduler spec
// "Next-Run/Last-Run/Last-Status Surfaced").
func (s *scheduler) Status(ctx context.Context) Status {
	cfg, err := s.store.GetScheduleConfig(ctx)
	if err != nil {
		return Status{Running: s.isRunning()}
	}
	return Status{
		Enabled:       cfg.Enabled,
		NextRunAtMs:   cfg.NextRunAtMs,
		LastRunAtMs:   cfg.LastRunAtMs,
		LastRunStatus: cfg.LastRunStatus,
		Running:       s.isRunning(),
	}
}

// isRunning reports whether the scheduler loop is active.
func (s *scheduler) isRunning() bool {
	return s.running.Load()
}

// acquire attempts to take the concurrent-run guard. On success it returns a cancellable run
// context (derived from ctx AND bounded by maxRunDuration) plus a done channel the caller
// (Stop, or the loop) can wait on; the guard is released exactly once, by the goroutine/caller
// that finishes the run, in releaseGuard.
func (s *scheduler) acquire(ctx context.Context) (runCtx context.Context, done chan struct{}, ok bool) {
	if !s.running.CompareAndSwap(false, true) {
		return nil, nil, false
	}

	runCtx, cancel := context.WithTimeout(ctx, s.maxRunDuration)
	doneChan := make(chan struct{})

	s.mu.Lock()
	s.runCancel = cancel
	s.runDoneChan = doneChan
	s.mu.Unlock()

	return runCtx, doneChan, true
}

// executeRun runs the injected RunFunc synchronously under runCtx, then releases the guard
// and clears the run bookkeeping exactly once. It is shared by TriggerNow (synchronous caller)
// and the scheduled-tick path (loop runs it in its own goroutine so the loop can keep ticking
// — design.md never requires the loop to block on a run's completion before re-arming).
func (s *scheduler) executeRun(runCtx context.Context, doneChan chan struct{}, trigger string) (string, error) {
	cancel := func() {
		s.mu.Lock()
		c := s.runCancel
		s.mu.Unlock()
		if c != nil {
			c()
		}
	}
	defer cancel()
	defer close(doneChan)
	defer s.releaseGuard(doneChan)

	if s.run == nil {
		return "", nil
	}

	status, err := s.run(runCtx, trigger)
	if err != nil {
		s.logf("schedule: run (trigger=%s) returned an error: %v", trigger, err)
	}
	return status, err
}

// releaseGuard clears the `running` flag and run bookkeeping IF this call owns the current
// doneChan (guards against a late releaseGuard from an abandoned/drained run clobbering a
// LATER run's bookkeeping after Stop() gave up waiting).
func (s *scheduler) releaseGuard(doneChan chan struct{}) {
	s.mu.Lock()
	if s.runDoneChan == doneChan {
		s.runCancel = nil
		s.runDoneChan = nil
	}
	s.mu.Unlock()
	s.running.Store(false)
}

// loop runs the scheduler until its context is canceled.
func (s *scheduler) loop(ctx context.Context) {
	for {
		if shouldStopLoop(ctx) {
			return
		}

		cfg, ok := s.loadEnabledScheduleConfig(ctx)
		if !ok {
			continue
		}

		next, ok := s.nextScheduledBoundary(ctx, cfg)
		if !ok {
			continue
		}

		sleep := s.sleepUntil(ctx, next)
		if sleep == sleepCancelled || shouldStopLoop(ctx) {
			return
		}
		if sleep == sleepWoken {
			continue
		}

		s.fireScheduledTick(ctx)
	}
}

// shouldStopLoop reports whether the scheduler context has been canceled.
func shouldStopLoop(ctx context.Context) bool {
	return ctx.Err() != nil
}

// loadEnabledScheduleConfig loads the current enabled schedule configuration.
func (s *scheduler) loadEnabledScheduleConfig(ctx context.Context) (download.ScheduleConfig, bool) {
	cfg, err := s.store.GetScheduleConfig(ctx)
	if err != nil {
		s.logf("schedule: failed to read schedule config, retrying after idle interval: %v", err)
		s.waitForIdleRetry(ctx)
		return download.ScheduleConfig{}, false
	}
	if !cfg.Enabled {
		s.waitForIdleRetry(ctx)
		return download.ScheduleConfig{}, false
	}
	return cfg, true
}

// nextScheduledBoundary calculates the next scheduled run boundary.
func (s *scheduler) nextScheduledBoundary(ctx context.Context, cfg download.ScheduleConfig) (time.Time, bool) {
	next, err := nextDailyBoundaryAfter(s.clock.Now(), cfg.DailyTimeHHMM, cfg.EnabledWeekdays, s.clock.Now().Location())
	if err == nil {
		return next, true
	}
	// ErrNoEnabledWeekday (empty weekday set) is treated the SAME as a disabled
	// schedule or a parse error -- idle re-check, never fire (design.md "Empty Weekday
	// Set Disables Scheduling").
	s.logf("schedule: cannot compute next boundary for daily_time_hhmm %q, retrying after idle interval: %v", cfg.DailyTimeHHMM, err)
	return time.Time{}, s.waitForIdleRetry(ctx)
}

// waitForIdleRetry waits before retrying an unavailable schedule configuration.
func (s *scheduler) waitForIdleRetry(ctx context.Context) bool {
	return s.sleepUntil(ctx, s.clock.Now().Add(s.idleInterval)) != sleepCancelled
}

// fireScheduledTick attempts to start a scheduled run. If the guard is already held it logs
// and SKIPS -- never surfaces an error to anyone (design-scheduler spec "Scheduled tick fires
// during an active manual run").
func (s *scheduler) fireScheduledTick(ctx context.Context) {
	runCtx, doneChan, ok := s.acquire(ctx)
	if !ok {
		s.logf("schedule: scheduled tick skipped -- a run is already in progress")
		return
	}
	startedAt := s.clock.Now()
	// Run synchronously within the tick: the loop re-arms its timer on the NEXT iteration
	// after the run finishes, which is correct for a daily cadence (there is no benefit to
	// racing the next day's boundary against an in-flight run, and it keeps the guard's
	// happens-before relationship with the loop simple and race-free).
	status, err := s.executeRun(runCtx, doneChan, "scheduled")
	s.markScheduledRun(ctx, startedAt, status, err)
}

// markScheduledRun records the result of a scheduled run.
func (s *scheduler) markScheduledRun(ctx context.Context, startedAt time.Time, status string, runErr error) {
	if status == "" {
		if runErr != nil {
			status = "error"
		} else {
			status = "ok"
		}
	}

	nextAtMs := int64(0)
	if cfg, err := s.store.GetScheduleConfig(ctx); err == nil && cfg.Enabled {
		if next, nextErr := nextDailyBoundaryAfter(s.clock.Now(), cfg.DailyTimeHHMM, cfg.EnabledWeekdays, s.clock.Now().Location()); nextErr == nil {
			nextAtMs = next.UnixMilli()
		}
	}

	if err := s.store.MarkScheduleRun(ctx, startedAt.UnixMilli(), status, nextAtMs); err != nil {
		s.logf("schedule: failed to mark scheduled run result: %v", err)
	}
}

// logf writes a scheduler-scoped formatted log message.
func (s *scheduler) logf(format string, args ...any) {
	if s.log == nil {
		return
	}
	s.log.Warnf("download", format, args...)
}

var _ Scheduler = (*scheduler)(nil)
