package anime

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"time"

	sharedlogger "autoreas-bridge/internal/logger"
	"github.com/fsnotify/fsnotify"
	"github.com/google/uuid"
)

type FileWatcher interface {
	Add(name string) error
	Events() <-chan fsnotify.Event
	Errors() <-chan error
	Close() error
}

type DebounceTimer interface {
	C() <-chan time.Time
	Reset(time.Duration)
	Stop() bool
}

type RuntimeWatcher interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
}

type RuntimeWatcherConfig struct {
	FilePath         string
	Parser           SnapshotParser
	Store            SnapshotStore
	Publisher        EventPublisher
	Logger           WarningLogger
	SharedLogger     sharedlogger.Logger
	SelfEchoRegistry SelfEchoRegistry
	DebounceWindow   time.Duration
	RetryDelay       time.Duration
	OpenFile         func(path string) (io.ReadCloser, error)
	WatcherFactory   func() (FileWatcher, error)
	TimerFactory     func() DebounceTimer
}

type runtimeWatcher struct {
	filePath         string
	watchDir         string
	watchBase        string
	parser           SnapshotParser
	store            SnapshotStore
	publisher        EventPublisher
	logger           WarningLogger
	sharedLogger     sharedlogger.Logger
	selfEchoRegistry SelfEchoRegistry
	debounceWindow   time.Duration
	retryDelay       time.Duration
	openFile         func(path string) (io.ReadCloser, error)
	watcherFactory   func() (FileWatcher, error)
	timerFactory     func() DebounceTimer

	startOnce sync.Once
	wg        sync.WaitGroup

	mu  sync.Mutex
	err error
}

func NewRuntimeWatcher(config RuntimeWatcherConfig) RuntimeWatcher {
	watcher := &runtimeWatcher{
		filePath:         config.FilePath,
		watchDir:         filepath.Dir(config.FilePath),
		watchBase:        filepath.Base(config.FilePath),
		parser:           config.Parser,
		store:            config.Store,
		publisher:        config.Publisher,
		logger:           config.Logger,
		sharedLogger:     config.SharedLogger,
		selfEchoRegistry: config.SelfEchoRegistry,
		debounceWindow:   config.DebounceWindow,
		retryDelay:       config.RetryDelay,
		openFile:         config.OpenFile,
		watcherFactory:   config.WatcherFactory,
		timerFactory:     config.TimerFactory,
	}

	if watcher.debounceWindow <= 0 {
		watcher.debounceWindow = 50 * time.Millisecond
	}
	if watcher.retryDelay <= 0 {
		watcher.retryDelay = 100 * time.Millisecond
	}
	if watcher.openFile == nil {
		watcher.openFile = defaultOpenFile
	}
	if watcher.watcherFactory == nil {
		watcher.watcherFactory = func() (FileWatcher, error) {
			backend, err := fsnotify.NewWatcher()
			if err != nil {
				return nil, err
			}
			return fsnotifyAdapter{Watcher: backend}, nil
		}
	}
	if watcher.timerFactory == nil {
		watcher.timerFactory = func() DebounceTimer {
			return newRealDebounceTimer()
		}
	}

	return watcher
}

func (w *runtimeWatcher) StartAsync(ctx context.Context) {
	w.startOnce.Do(func() {
		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			w.run(ctx)
		}()
	})
}

func (w *runtimeWatcher) Wait() {
	w.wg.Wait()
}

func (w *runtimeWatcher) Err() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.err
}

func (w *runtimeWatcher) run(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}

		backend, err := w.watcherFactory()
		if err != nil {
			w.retryOrSetErr(ctx, fmt.Errorf("create file watcher: %w", err))
			if w.Err() != nil {
				return
			}
			continue
		}

		if err := backend.Add(w.watchDir); err != nil {
			_ = backend.Close()
			w.retryOrSetErr(ctx, fmt.Errorf("watch parent directory %q: %w", w.watchDir, err))
			if w.Err() != nil {
				return
			}
			continue
		}

		timer := w.timerFactory()
		restart, terminalErr := w.serveLoop(ctx, backend, timer)
		_ = backend.Close()
		_ = timer.Stop()
		if terminalErr != nil {
			w.setErr(terminalErr)
			return
		}
		if !restart {
			return
		}
	}
}

func (w *runtimeWatcher) serveLoop(ctx context.Context, backend FileWatcher, timer DebounceTimer) (restart bool, terminalErr error) {
	for {
		select {
		case <-ctx.Done():
			return false, nil
		case event, ok := <-backend.Events():
			if !ok {
				return true, nil
			}
			if filepath.Base(event.Name) != w.watchBase {
				continue
			}
			timer.Reset(w.debounceWindow)
		case <-timer.C():
			if err := w.processCurrentFile(ctx); err != nil {
				return false, err
			}
		case err, ok := <-backend.Errors():
			if !ok {
				return true, nil
			}
			newDomainLogger("anime", w.sharedLogger, w.logger).Warnf("watch runtime changes: %v", err)
			w.waitRetry(ctx)
			return true, nil
		}
	}
}

func (w *runtimeWatcher) retryOrSetErr(ctx context.Context, err error) {
	newDomainLogger("anime", w.sharedLogger, w.logger).Warnf("%v", err)
	if !w.waitRetry(ctx) {
		w.setErr(err)
	}
}

func (w *runtimeWatcher) waitRetry(ctx context.Context) bool {
	timer := time.NewTimer(w.retryDelay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (w *runtimeWatcher) processCurrentFile(ctx context.Context) error {
	log := newDomainLogger("anime", w.sharedLogger, w.logger)
	start := time.Now()
	correlationID := uuid.NewString()

	file, err := w.openFile(w.filePath)
	if err != nil {
		log.Errorf("failed to open runtime watcher file %s: %v", w.filePath, err)
		return fmt.Errorf("open anime data file %q: %w", w.filePath, err)
	}
	defer file.Close()

	current, warnings, err := w.parser.Parse(file)
	if err != nil {
		log.Errorf("failed to parse runtime watcher file %s: %v", w.filePath, err)
		return fmt.Errorf("parse anime snapshots: %w", err)
	}
	for _, warning := range warnings {
		if w.logger != nil {
			w.logger.Warnf("warning parsing %s line %d: %s", w.filePath, warning.Line, warning.Reason)
		}
		log.Warnf("warning parsing %s line %d: %s", w.filePath, warning.Line, warning.Reason)
	}

	baseline, err := w.store.ListSnapshots(ctx)
	if err != nil {
		log.Errorf("failed to load runtime watcher baseline: %v", err)
		return fmt.Errorf("list baseline snapshots: %w", err)
	}

	deltas, pruneIDs := DiffSnapshots(current, baseline)
	for _, delta := range deltas {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if w.selfEchoRegistry != nil && len(delta.Payload) > 0 && w.selfEchoRegistry.ConsumeIfPresent(delta.Payload) {
			continue
		}
		delta.CorrelationID = correlationID
		w.publisher.Publish(delta)
	}
	if len(deltas) > 0 || len(pruneIDs) > 0 {
		elapsed := time.Since(start)
		log.Logf(sharedlogger.LevelInfo, sharedlogger.Fields{
			EventType:     "anime.watcher",
			DurationMs:    elapsed.Milliseconds(),
			CorrelationID: correlationID,
		}, "runtime watcher published %d deltas and %d prunes", len(deltas), len(pruneIDs))
	}

	if err := w.store.ReplaceBaseline(ctx, current, pruneIDs); err != nil {
		log.Errorf("failed to replace runtime watcher baseline: %v", err)
		return fmt.Errorf("replace baseline snapshots: %w", err)
	}

	return nil
}

func (w *runtimeWatcher) setErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}

type fsnotifyAdapter struct{ Watcher *fsnotify.Watcher }

func (a fsnotifyAdapter) Add(name string) error         { return a.Watcher.Add(name) }
func (a fsnotifyAdapter) Events() <-chan fsnotify.Event { return a.Watcher.Events }
func (a fsnotifyAdapter) Errors() <-chan error          { return a.Watcher.Errors }
func (a fsnotifyAdapter) Close() error                  { return a.Watcher.Close() }

type realDebounceTimer struct{ timer *time.Timer }

func newRealDebounceTimer() DebounceTimer {
	timer := time.NewTimer(time.Hour)
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	return &realDebounceTimer{timer: timer}
}

func (t *realDebounceTimer) C() <-chan time.Time { return t.timer.C }

func (t *realDebounceTimer) Reset(d time.Duration) {
	if !t.timer.Stop() {
		select {
		case <-t.timer.C:
		default:
		}
	}
	t.timer.Reset(d)
}

func (t *realDebounceTimer) Stop() bool {
	return t.timer.Stop()
}
