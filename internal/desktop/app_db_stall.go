package desktop

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"runtime/pprof"
	"sync/atomic"
	"time"
	"uuid"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/observability/dbstall"
	"autoreas-bridge/internal/observability/eventlog"
	bridgeSync "autoreas-bridge/internal/sync"
)

const (
	// stallEventType is the Activity event of one held bridge.db connection.
	stallEventType = "api.db_stalled"
	// stallImportFailedEventType reports evidence a start could not import.
	stallImportFailedEventType = "api.db_stall_import_failed"
	// stallProbeBudget is how long an abandoned request waits for the
	// connection before the pool reads as held.
	stallProbeBudget = time.Second
	// stallImportBudget bounds the start-up import of one stall.
	stallImportBudget = 5 * time.Second
	// stallLogDir is the evidence directory, next to bridge.db.
	stallLogDir = "logs"
)

// stallEvidence records a held bridge.db connection
// (docs/architecture/contexts/observability/overview.md, Stall evidence). It
// runs nothing on its own: an abandoned request asks it to probe the pool, and
// only a probe that cannot get the connection writes the evidence file, once
// per process.
type stallEvidence struct {
	db          *sql.DB
	dir         string
	logger      sharedlogger.Logger
	probeBudget time.Duration
	probe       func(ctx context.Context) error
	now         func() time.Time
	newID       func() string
	probing     atomic.Bool
	recorded    atomic.Bool
}

// newStallEvidence keeps evidence for db in dir.
func newStallEvidence(db *sql.DB, dir string, logger sharedlogger.Logger) *stallEvidence {
	evidence := &stallEvidence{
		db: db, dir: dir, logger: logger, probeBudget: stallProbeBudget,
		now: time.Now, newID: func() string { return uuid.New().String() },
	}
	evidence.probe = evidence.probePool
	return evidence
}

// probePool asks for the pool's connection and gives it straight back.
func (s *stallEvidence) probePool(ctx context.Context) error {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return err
	}
	return conn.Close()
}

// onRequestAbandoned probes the pool after a client gave up on route. A
// connection that comes back within the budget means the pool is free and the
// client simply left. A probe that runs out of time means something holds the
// connection: the goroutine dump is written now, while the holder still
// holds it. Only one probe runs at a time, and evidence is written once.
func (s *stallEvidence) onRequestAbandoned(route string) {
	if s.recorded.Load() || !s.probing.CompareAndSwap(false, true) {
		return
	}
	defer s.probing.Store(false)
	ctx, cancel := context.WithTimeout(context.Background(), s.probeBudget)
	defer cancel()
	// A free pool means the client simply left; a closed database (shutdown)
	// is not a stall either. Only a probe that ran out of time is one.
	if err := s.probe(ctx); !errors.Is(err, context.DeadlineExceeded) || !s.recorded.CompareAndSwap(false, true) {
		return
	}
	s.record(route)
}

// record writes the evidence file. Its failure can only go to the logger's
// non-database sinks: the database is the thing that is stuck.
func (s *stallEvidence) record(route string) {
	var dump bytes.Buffer
	_ = pprof.Lookup("goroutine").WriteTo(&dump, 2)
	header := dbstall.Header{
		ID: s.newID(), OccurredAtMS: s.now().UnixMilli(), Route: route, Pool: dbstall.PoolStatsFrom(s.db.Stats()),
	}
	if err := dbstall.Write(s.dir, header, dump.Bytes()); err != nil && s.logger != nil {
		s.logger.Logf("api", sharedlogger.LevelError, sharedlogger.Fields{
			EventType: "api.db_stall_write_failed", Metadata: map[string]any{"cause": err.Error()},
		}, "failed to write the bridge.db stall evidence: %v", err)
	}
}

// onRequestAbandoned is the HTTP server's abandoned-request hook.
func (a *App) onRequestAbandoned(route string) {
	if a.dbStall != nil {
		a.dbStall.onRequestAbandoned(route)
	}
}

// defaultStallLogDir is logs/ beside the production bridge.db.
func defaultStallLogDir() (string, error) {
	path, err := bridgeSync.ResolveBridgeDBPath()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(path), stallLogDir), nil
}

// configureStallEvidence keeps the evidence where resolveStallLogDir says. It
// is set only beside the real bootstrap, so an App built on an injected
// database keeps no evidence.
func (a *App) configureStallEvidence() {
	if a.dbStall != nil || a.bridgeDB == nil || a.resolveStallLogDir == nil {
		return
	}
	dir, err := a.resolveStallLogDir()
	if err != nil {
		a.logStallImportFailure(err)
		return
	}
	a.dbStall = newStallEvidence(a.bridgeDB, dir, a.sharedLogger)
}

// importStallEvidence turns the stall a previous process recorded into one
// Activity event, then rotates its file. The row is written directly, not
// through the queue that drops a failed write: the file is rotated only once
// the row is confirmed stored, so a failed write leaves it for the next start,
// and the stall id stops a second row when a rotation failed after the write.
// It runs before the HTTP server accepts requests.
func (a *App) importStallEvidence() {
	if a.dbStall == nil {
		return
	}
	pending, ok, err := dbstall.ReadPending(a.dbStall.dir)
	if !ok {
		return
	}
	if err != nil {
		a.logStallImportFailure(err)
		a.rotateStallEvidence()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), stallImportBudget)
	defer cancel()
	store := eventlog.NewStore(a.bridgeDB)
	stored, err := store.HasCorrelatedEvent(ctx, stallEventType, pending.Header.ID)
	if err != nil {
		a.logStallImportFailure(err)
		return
	}
	if !stored {
		record := stallRecord(pending)
		if err := store.InsertEvent(ctx, record); err != nil {
			a.logStallImportFailure(err)
			return
		}
		a.recordEventIncident(record)
	}
	a.rotateStallEvidence()
}

// stallRecord is the Activity event of one stall: an error, so it opens an
// incident, correlated by the stall id written in the evidence file.
func stallRecord(pending dbstall.Pending) eventlog.EventRecord {
	header := pending.Header
	return eventlog.EventRecord{
		OccurredAtMS:  header.OccurredAtMS,
		Domain:        "api",
		Level:         sharedlogger.LevelError,
		EventType:     stallEventType,
		CorrelationID: header.ID,
		Message: fmt.Sprintf("bridge.db connection held while a request to %s was abandoned; evidence in %s/db-stall-*.log, stall %s",
			header.Route, stallLogDir, header.ID),
		Metadata: header.Metadata(dbstall.Suspects(pending.Dump), eventlog.MaxMetadataBytes),
	}
}

// rotateStallEvidence moves the imported file down the chain.
func (a *App) rotateStallEvidence() {
	if err := dbstall.Rotate(a.dbStall.dir); err != nil {
		a.logStallImportFailure(err)
	}
}

// logStallImportFailure records why stall evidence could not be imported.
func (a *App) logStallImportFailure(err error) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Logf("api", sharedlogger.LevelWarn, sharedlogger.Fields{
		EventType: stallImportFailedEventType, Metadata: map[string]any{"cause": err.Error()},
	}, "failed to import the bridge.db stall evidence: %v", err)
}
