package anime

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"github.com/fsnotify/fsnotify"
	"github.com/google/uuid"
)

// FileWatcher abstracts the fsnotify watcher used by the runtime watcher.
type FileWatcher interface {
	Add(name string) error
	Events() <-chan fsnotify.Event
	Errors() <-chan error
	Close() error
}

// DebounceTimer abstracts the watcher's debounce timer.
type DebounceTimer interface {
	C() <-chan time.Time
	Reset(time.Duration)
	Stop() bool
}

// RuntimeWatcher monitors runtime file changes and publishes reconciled deltas.
type RuntimeWatcher interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
}

// RuntimeWatcherConfig wires the runtime watcher dependencies.
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
	// Notifier surfaces the watcher's single terminal-failure moment as a
	// user-facing notification (design.md §2.2, ADR-29-2), mirroring
	// download.ServiceDeps.Notifier. Optional: a nil Notifier is a safe
	// no-op.
	Notifier notification.Notifier
	// Ownership is the SDD-48 (ADR-48-2) Bridge-native ownership registry.
	// The watcher loads ownedIDs from it right before every DiffSnapshots
	// call, closing the runtime-recurrence hole (a nil Registry here yields
	// a nil ownedIDs map, reproducing pre-SDD-48 behavior).
	Ownership BridgeNativeRegistry
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
	notifier         notification.Notifier
	ownership        BridgeNativeRegistry

	startOnce sync.Once
	wg        sync.WaitGroup

	mu  sync.Mutex
	err error
}

// NewRuntimeWatcher builds the runtime directory watcher for animes.dat.
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
		notifier:         config.Notifier,
		ownership:        config.Ownership,
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

// run maintains the runtime watcher until cancellation or terminal failure.
func (w *runtimeWatcher) run(ctx context.Context) {
	for {
		if !w.runWatchAttempt(ctx) {
			return
		}
	}
}

// runWatchAttempt creates and serves one filesystem watch attempt.
func (w *runtimeWatcher) runWatchAttempt(ctx context.Context) bool {
	if ctx.Err() != nil {
		return false
	}
	backend, err := w.watcherFactory()
	if err != nil {
		return w.retryWatchAttempt(ctx, fmt.Errorf("create file watcher: %w", err))
	}
	defer func() {
		if err := backend.Close(); err != nil {
			newDomainLogger("anime", w.sharedLogger, w.logger).Warnf("close file watcher: %v", err)
		}
	}()
	if err := backend.Add(w.watchDir); err != nil {
		return w.retryWatchAttempt(ctx, fmt.Errorf("watch parent directory %q: %w", w.watchDir, err))
	}
	timer := w.timerFactory()
	defer timer.Stop()
	restart, terminalErr := w.serveLoop(ctx, backend, timer)
	if terminalErr == nil {
		return restart
	}
	w.setErr(terminalErr)
	w.notify(ctx, terminalErr)
	return false
}

// retryWatchAttempt records a transient watch error and waits before retrying.
func (w *runtimeWatcher) retryWatchAttempt(ctx context.Context, err error) bool {
	w.retryOrSetErr(ctx, err)
	return w.Err() == nil
}

// serveLoop consumes filesystem events and debounces file processing.
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

// retryOrSetErr retries a transient error or stores it as terminal.
func (w *runtimeWatcher) retryOrSetErr(ctx context.Context, err error) {
	newDomainLogger("anime", w.sharedLogger, w.logger).Warnf("%v", err)
	if !w.waitRetry(ctx) {
		w.setErr(err)
	}
}

// waitRetry waits for the configured retry delay or cancellation.
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

// processCurrentFile parses the current file and publishes snapshot deltas.
func (w *runtimeWatcher) processCurrentFile(ctx context.Context) (err error) {
	if w.selfEchoRegistry != nil && w.selfEchoRegistry.ReplacementInFlight() {
		return nil
	}
	log := newDomainLogger("anime", w.sharedLogger, w.logger)
	start := time.Now()
	correlationID := uuid.NewString()

	current, err := w.parseCurrentFile(log)
	if err != nil {
		return err
	}
	baseline, err := w.store.ListSnapshots(ctx)
	if err != nil {
		return fmt.Errorf("list baseline snapshots: %w", err)
	}
	ownedIDs, err := w.loadOwnedIDs(ctx)
	if err != nil {
		return fmt.Errorf("list owned ids: %w", err)
	}

	deltas, pruneIDs := DiffSnapshots(current, baseline, ownedIDs)
	if err := w.publishDeltas(ctx, deltas, correlationID); err != nil {
		return err
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

// parseCurrentFile opens and parses the watcher's current data file.
func (w *runtimeWatcher) parseCurrentFile(log domainLogger) (current map[string]SnapshotRecord, err error) {
	file, err := w.openFile(w.filePath)
	if err != nil {
		return nil, fmt.Errorf("open anime data file %q: %w", w.filePath, err)
	}
	defer func() {
		if closeErr := file.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close anime data file %q: %w", w.filePath, closeErr)
		}
	}()
	current, warnings, err := w.parser.Parse(file)
	if err != nil {
		return nil, fmt.Errorf("parse anime snapshots: %w", err)
	}
	for _, warning := range warnings {
		w.logParseWarning(log, warning)
	}
	return current, nil
}

// logParseWarning forwards a parser warning to configured loggers.
func (w *runtimeWatcher) logParseWarning(log domainLogger, warning ParseWarning) {
	if w.logger != nil {
		w.logger.Warnf("warning parsing %s line %d: %s", w.filePath, warning.Line, warning.Reason)
	}
	log.Warnf("warning parsing %s line %d: %s", w.filePath, warning.Line, warning.Reason)
}

// publishDeltas emits watcher deltas while honoring cancellation and self-echoes.
func (w *runtimeWatcher) publishDeltas(ctx context.Context, deltas []events.AnimeChangedEvent, correlationID string) error {
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
	return nil
}

// loadOwnedIDs returns the Bridge-native ownership set (SDD-48, ADR-48-2), or
// nil when no registry is configured -- the rollback lever: a nil Ownership
// dep yields a nil ownedIDs map, which DiffSnapshots treats as "everything
// unowned", reproducing pre-SDD-48 behavior exactly.
func (w *runtimeWatcher) loadOwnedIDs(ctx context.Context) (map[string]struct{}, error) {
	return loadOwnedIDs(ctx, w.ownership)
}

// setErr stores the watcher's terminal error.
func (w *runtimeWatcher) setErr(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.err = err
}

// notify surfaces the watcher's single terminal-failure moment as a
// user-facing error Notification (design.md §2.2, ADR-29-2). It is called
// exactly once per watcher lifecycle, immediately after setErr at the
// unique terminal exit in run() -- the transient, self-healing path in
// serveLoop deliberately does not call this. A nil Notifier is a safe
// no-op; a Notify error is discarded (the Dispatcher already isolates
// adapter failures, and a notify failure MUST NOT change the watcher's
// terminal outcome). CorrelationID is empty: no id is minted at this seam
// (ADR-29-4).
func (w *runtimeWatcher) notify(ctx context.Context, terminalErr error) {
	if w.notifier == nil {
		return
	}
	_ = w.notifier.Notify(ctx, notification.Notification{
		Source:    "anime",
		Level:     notification.LevelError,
		Title:     "Anime watcher stopped",
		Body:      fmt.Sprintf("the bridge stopped tracking anime data changes: %v", terminalErr),
		Timestamp: time.Now(),
	})
}

type fsnotifyAdapter struct{ Watcher *fsnotify.Watcher }

func (a fsnotifyAdapter) Add(name string) error         { return a.Watcher.Add(name) }
func (a fsnotifyAdapter) Events() <-chan fsnotify.Event { return a.Watcher.Events }
func (a fsnotifyAdapter) Errors() <-chan error          { return a.Watcher.Errors }
func (a fsnotifyAdapter) Close() error                  { return a.Watcher.Close() }

type realDebounceTimer struct{ timer *time.Timer }

// newRealDebounceTimer creates a stopped timer for filesystem debouncing.
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
