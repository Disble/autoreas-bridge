package schedule

import (
	"context"
	"time"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/logger"
)

// Timer is the minimal seam Scheduler needs from a timer (design.md §6 "a time.Timer with
// Reset"). Production code is backed by realClock/realTimer (time.NewTimer); tests inject a
// fully fake implementation so NOTHING in this package ever sleeps on a real clock.
type Timer interface {
	C() <-chan time.Time
	Stop() bool
	Reset(d time.Duration)
}

// Clock is the injected time seam (design.md §3.9 "every dependency is an interface"). Now
// must be safe to call from the scheduler goroutine concurrently with test-driven mutation.
type Clock interface {
	Now() time.Time
	NewTimer(d time.Duration) Timer
}

// ConfigStore is the minimal slice of download.Store the scheduler needs -- reading
// the persisted schedule and recording run outcomes (design.md §3.6 GetScheduleConfig /
// MarkScheduleRun). It intentionally does NOT depend on the full Store interface so
// this package has no SQLite/store-package import and stays unit-testable with a tiny fake.
type ConfigStore interface {
	GetScheduleConfig(ctx context.Context) (download.ScheduleConfig, error)
	MarkScheduleRun(ctx context.Context, lastAtMs int64, status string, nextAtMs int64) error
}

// RunFunc is the injected run-callback seam (design.md §3.9). Phase 6 wires the real
// download.Service.RunOnce(ctx, trigger) here; trigger is "scheduled" or "manual". The
// scheduler does NOT depend on download.Service directly -- only on this func signature.
// The returned status is persisted for scheduled runs so the Schedule panel's Last run state
// reflects the actual terminal download outcome.
type RunFunc func(ctx context.Context, trigger string) (string, error)

// Status is the next/last-run/last-status snapshot surfaced to the Wails bindings (Phase 6)
// and UI (design-scheduler spec "Next-Run/Last-Run/Last-Status Surfaced").
type Status struct {
	Enabled       bool
	NextRunAtMs   int64
	LastRunAtMs   int64
	LastRunStatus string
	Running       bool
}

// Deps are the constructor seams for Scheduler. Every field is an interface or func so the
// whole scheduler is testable without real time or a real download (PR4a brief).
type Deps struct {
	Store ConfigStore
	Clock Clock
	Run   RunFunc
	Log   logger.Logger

	// IdleInterval overrides defaultIdleInterval (re-check cadence while disabled).
	IdleInterval time.Duration
	// ShutdownDrainWait overrides defaultShutdownDrainWait.
	ShutdownDrainWait time.Duration
	// MaxRunDuration overrides defaultMaxRunDuration.
	MaxRunDuration time.Duration
}

// Scheduler is the design.md §3.5 port.
type Scheduler interface {
	Start(ctx context.Context)
	Stop()
	NotifyConfigChanged()
	TriggerNow(ctx context.Context, trigger string) error
	Status(ctx context.Context) Status
}

// NewScheduler builds a Scheduler from the given Deps, defaulting unset durations.
func NewScheduler(deps Deps) Scheduler {
	s := &scheduler{
		store:             deps.Store,
		clock:             deps.Clock,
		run:               deps.Run,
		log:               deps.Log,
		idleInterval:      deps.IdleInterval,
		shutdownDrainWait: deps.ShutdownDrainWait,
		maxRunDuration:    deps.MaxRunDuration,
		loopDone:          make(chan struct{}),
		wake:              make(chan struct{}, 1),
	}
	if s.idleInterval <= 0 {
		s.idleInterval = defaultIdleInterval
	}
	if s.shutdownDrainWait <= 0 {
		s.shutdownDrainWait = defaultShutdownDrainWait
	}
	if s.maxRunDuration <= 0 {
		s.maxRunDuration = defaultMaxRunDuration
	}
	return s
}
