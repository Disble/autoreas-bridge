package anime

import (
	"context"
	"io"
	"os"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// SnapshotStore persists the effective anime snapshot baseline used by startup
// catch-up and runtime watching.
type SnapshotStore interface {
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}

// EventPublisher emits domain events produced by snapshot reconciliation.
type EventPublisher interface {
	Publish(event events.Event)
}

// WarningLogger records non-fatal boundary warnings.
type WarningLogger interface {
	Warnf(format string, args ...any)
}

// Ticker abstracts polling timers for startup catch-up tests.
type Ticker interface {
	C() <-chan time.Time
	Stop()
}

// StartupCoordinator waits for animes.dat to exist, runs catch-up once, and
// exposes the terminal outcome.
type StartupCoordinator interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
	ContextErr() error
}

// StartupCoordinatorConfig wires the startup catch-up dependencies.
type StartupCoordinatorConfig struct {
	FilePath      string
	Parser        SnapshotParser
	Store         SnapshotStore
	Publisher     EventPublisher
	Logger        WarningLogger
	SharedLogger  sharedlogger.Logger
	PollInterval  time.Duration
	FileExists    func(path string) bool
	OpenFile      func(path string) (io.ReadCloser, error)
	TickerFactory func(interval time.Duration) Ticker
	// Ownership is the SDD-48 (ADR-48-2) Bridge-native ownership registry,
	// threaded into the catch-up reconcile's DiffSnapshots call. Nil is
	// safe (rollback lever): it reproduces pre-SDD-48 behavior.
	Ownership BridgeNativeRegistry
}

type startupCoordinator struct {
	filePath      string
	parser        SnapshotParser
	store         SnapshotStore
	publisher     EventPublisher
	logger        WarningLogger
	sharedLogger  sharedlogger.Logger
	pollInterval  time.Duration
	fileExists    func(path string) bool
	openFile      func(path string) (io.ReadCloser, error)
	tickerFactory func(interval time.Duration) Ticker
	ownership     BridgeNativeRegistry

	startOnce sync.Once
	wg        sync.WaitGroup

	mu         sync.Mutex
	err        error
	contextErr error
}

// NewStartupCoordinator builds the startup catch-up coordinator.
func NewStartupCoordinator(config StartupCoordinatorConfig) StartupCoordinator {
	coordinator := &startupCoordinator{
		filePath:      config.FilePath,
		parser:        config.Parser,
		store:         config.Store,
		publisher:     config.Publisher,
		logger:        config.Logger,
		sharedLogger:  config.SharedLogger,
		pollInterval:  config.PollInterval,
		fileExists:    config.FileExists,
		openFile:      config.OpenFile,
		tickerFactory: config.TickerFactory,
		ownership:     config.Ownership,
	}

	if coordinator.pollInterval <= 0 {
		coordinator.pollInterval = 5 * time.Second
	}
	if coordinator.fileExists == nil {
		coordinator.fileExists = defaultFileExists
	}
	if coordinator.openFile == nil {
		coordinator.openFile = defaultOpenFile
	}
	if coordinator.tickerFactory == nil {
		coordinator.tickerFactory = func(interval time.Duration) Ticker {
			return realTicker{Ticker: time.NewTicker(interval)}
		}
	}

	return coordinator
}

func (c *startupCoordinator) StartAsync(ctx context.Context) {
	c.startOnce.Do(func() {
		c.wg.Add(1)
		go func() {
			defer c.wg.Done()
			c.run(ctx)
		}()
	})
}

func (c *startupCoordinator) Wait() {
	c.wg.Wait()
}

func (c *startupCoordinator) Err() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.err
}

func (c *startupCoordinator) ContextErr() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.contextErr
}

// run waits for the source file and performs startup catch-up.
func (c *startupCoordinator) run(ctx context.Context) {
	ticker := c.tickerFactory(c.pollInterval)
	defer ticker.Stop()

	for {
		if c.runAttempt(ctx, ticker) {
			return
		}
	}
}

// runAttempt performs one startup availability check.
func (c *startupCoordinator) runAttempt(ctx context.Context, ticker Ticker) bool {
	if ctx.Err() != nil {
		c.setContextErr(ctx.Err())
		return true
	}
	if c.fileExists(c.filePath) {
		return c.runCatchUp(ctx)
	}
	c.logWaitingForData()
	select {
	case <-ctx.Done():
		c.setContextErr(ctx.Err())
		return true
	case <-ticker.C():
		return false
	}
}

// runCatchUp executes the startup snapshot pull once.
func (c *startupCoordinator) runCatchUp(ctx context.Context) bool {
	if err := c.catchUp(ctx); err != nil {
		if ctx.Err() != nil {
			c.setContextErr(ctx.Err())
		} else {
			c.setErr(err)
		}
	}
	return true
}

// logWaitingForData records that the source file is not available yet.
func (c *startupCoordinator) logWaitingForData() {
	if c.logger != nil {
		c.logger.Warnf("Esperando datos: %s", c.filePath)
	}
	newDomainLogger("system", c.sharedLogger, c.logger).Warnf("Esperando datos: %s", c.filePath)
}

// catchUp runs the snapshot pull pipeline for startup data.
func (c *startupCoordinator) catchUp(ctx context.Context) error {
	_, err := runSnapshotPullPipeline(ctx, snapshotPullPipelineConfig{
		filePath:     c.filePath,
		parser:       c.parser,
		store:        c.store,
		publisher:    c.publisher,
		logger:       c.logger,
		sharedLogger: c.sharedLogger,
		openFile:     c.openFile,
		eventType:    "anime.catchup",
		logPrefix:    "startup catch-up",
		ownership:    c.ownership,
	})
	return err
}

// setErr stores the startup coordinator's terminal error.
func (c *startupCoordinator) setErr(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.err = err
}

// setContextErr stores cancellation reported by the startup context.
func (c *startupCoordinator) setContextErr(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.contextErr = err
}

type realTicker struct{ *time.Ticker }

func (t realTicker) C() <-chan time.Time { return t.Ticker.C }

// defaultFileExists reports whether a path exists.
func defaultFileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// defaultOpenFile opens a snapshot file for reading.
func defaultOpenFile(path string) (io.ReadCloser, error) {
	return os.Open(path)
}
