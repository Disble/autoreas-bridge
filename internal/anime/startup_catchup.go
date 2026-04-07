package anime

import (
	"context"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
)

type SnapshotStore interface {
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}

type EventPublisher interface {
	Publish(event events.Event)
}

type WarningLogger interface {
	Warnf(format string, args ...any)
}

type Ticker interface {
	C() <-chan time.Time
	Stop()
}

type StartupCoordinator interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
	ContextErr() error
}

type StartupCoordinatorConfig struct {
	FilePath      string
	Parser        SnapshotParser
	Store         SnapshotStore
	Publisher     EventPublisher
	Logger        WarningLogger
	PollInterval  time.Duration
	FileExists    func(path string) bool
	OpenFile      func(path string) (io.ReadCloser, error)
	TickerFactory func(interval time.Duration) Ticker
}

type startupCoordinator struct {
	filePath      string
	parser        SnapshotParser
	store         SnapshotStore
	publisher     EventPublisher
	logger        WarningLogger
	pollInterval  time.Duration
	fileExists    func(path string) bool
	openFile      func(path string) (io.ReadCloser, error)
	tickerFactory func(interval time.Duration) Ticker

	startOnce sync.Once
	wg        sync.WaitGroup

	mu         sync.Mutex
	err        error
	contextErr error
}

func NewStartupCoordinator(config StartupCoordinatorConfig) StartupCoordinator {
	coordinator := &startupCoordinator{
		filePath:      config.FilePath,
		parser:        config.Parser,
		store:         config.Store,
		publisher:     config.Publisher,
		logger:        config.Logger,
		pollInterval:  config.PollInterval,
		fileExists:    config.FileExists,
		openFile:      config.OpenFile,
		tickerFactory: config.TickerFactory,
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

func (c *startupCoordinator) run(ctx context.Context) {
	ticker := c.tickerFactory(c.pollInterval)
	defer ticker.Stop()

	for {
		if ctx.Err() != nil {
			c.setContextErr(ctx.Err())
			return
		}

		if c.fileExists(c.filePath) {
			if err := c.catchUp(ctx); err != nil {
				if ctx.Err() != nil {
					c.setContextErr(ctx.Err())
					return
				}
				c.setErr(err)
			}
			return
		}

		if c.logger != nil {
			c.logger.Warnf("Esperando datos: %s", c.filePath)
		}

		select {
		case <-ctx.Done():
			c.setContextErr(ctx.Err())
			return
		case <-ticker.C():
		}
	}
}

func (c *startupCoordinator) catchUp(ctx context.Context) error {
	file, err := c.openFile(c.filePath)
	if err != nil {
		return fmt.Errorf("open anime data file %q: %w", c.filePath, err)
	}
	defer file.Close()

	current, warnings, err := c.parser.Parse(file)
	if err != nil {
		return fmt.Errorf("parse anime snapshots: %w", err)
	}
	for _, warning := range warnings {
		if c.logger != nil {
			c.logger.Warnf("warning parsing %s line %d: %s", c.filePath, warning.Line, warning.Reason)
		}
	}

	baseline, err := c.store.ListSnapshots(ctx)
	if err != nil {
		return fmt.Errorf("list baseline snapshots: %w", err)
	}

	deltas, pruneIDs := DiffSnapshots(current, baseline)
	for _, delta := range deltas {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		c.publisher.Publish(delta)
	}

	if err := c.store.ReplaceBaseline(ctx, current, pruneIDs); err != nil {
		return fmt.Errorf("replace baseline snapshots: %w", err)
	}

	return nil
}

func (c *startupCoordinator) setErr(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.err = err
}

func (c *startupCoordinator) setContextErr(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.contextErr = err
}

type realTicker struct{ *time.Ticker }

func (t realTicker) C() <-chan time.Time { return t.Ticker.C }

func defaultFileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func defaultOpenFile(path string) (io.ReadCloser, error) {
	return os.Open(path)
}
