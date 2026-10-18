package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	gosync "sync"
	"testing"
	"time"
)

const vacuumFillerRows = 300

// countingVacuum wraps fullVacuum and counts how many times bootstrap invoked it.
func countingVacuum(calls *int, fullVacuum func(*sql.DB) error) func(*sql.DB) error {
	return func(db *sql.DB) error {
		*calls++
		return fullVacuum(db)
	}
}

// createFillerRows creates vacuum_filler holding rows of 4 KiB, one page each.
func createFillerRows(t *testing.T, db *sql.DB, rows int) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS vacuum_filler (id INTEGER PRIMARY KEY, body TEXT NOT NULL)`); err != nil {
		t.Fatalf("create vacuum_filler: %v", err)
	}
	body := strings.Repeat("x", 4096)
	for i := 0; i < rows; i++ {
		if _, err := db.Exec(`INSERT INTO vacuum_filler (body) VALUES (?)`, body); err != nil {
			t.Fatalf("insert vacuum_filler row %d: %v", i, err)
		}
	}
}

// countFillerRows returns the number of vacuum_filler rows.
func countFillerRows(t *testing.T, db *sql.DB) int {
	t.Helper()
	var got int
	if err := db.QueryRow(`SELECT COUNT(*) FROM vacuum_filler`).Scan(&got); err != nil {
		t.Fatalf("count vacuum_filler: %v", err)
	}
	return got
}

// createLegacyDatabase writes a WAL database in auto_vacuum NONE holding filler rows,
// the shape of every bridge.db created before incremental auto-vacuum.
func createLegacyDatabase(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	defer closeTestDB(t, db)
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		t.Fatalf("set legacy journal_mode: %v", err)
	}
	createFillerRows(t, db, vacuumFillerRows)
	if got := queryPragmaInt(t, db, "auto_vacuum"); got != 0 {
		t.Fatalf("legacy auto_vacuum = %d, want 0", got)
	}
	return dbPath
}

// openBridgeDBWithVacuum opens dbPath through bootstrap with the given full-vacuum seam.
func openBridgeDBWithVacuum(t *testing.T, dbPath string, fullVacuum func(*sql.DB) error) *sql.DB {
	t.Helper()
	db, err := SQLiteBootstrap{fullVacuum: fullVacuum}.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	return db
}

func TestOpenBridgeDBCreatesNewDatabaseInIncrementalAutoVacuumWithoutVacuum(t *testing.T) {
	t.Parallel()

	calls := 0
	db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), countingVacuum(&calls, runFullVacuum))
	defer closeTestDB(t, db)

	if got := queryPragmaInt(t, db, "auto_vacuum"); got != autoVacuumIncremental {
		t.Fatalf("auto_vacuum = %d, want %d", got, autoVacuumIncremental)
	}
	if calls != 0 {
		t.Fatalf("full VACUUM ran %d times on a new database, want 0", calls)
	}
}

func TestOpenBridgeDBConvertsExistingDatabaseOnceAndKeepsEveryRow(t *testing.T) {
	t.Parallel()

	dbPath := createLegacyDatabase(t)
	calls := 0
	fullVacuum := countingVacuum(&calls, runFullVacuum)

	db := openBridgeDBWithVacuum(t, dbPath, fullVacuum)
	if got := queryPragmaInt(t, db, "auto_vacuum"); got != autoVacuumIncremental {
		t.Fatalf("auto_vacuum after conversion = %d, want %d", got, autoVacuumIncremental)
	}
	if got := countFillerRows(t, db); got != vacuumFillerRows {
		t.Fatalf("rows after conversion = %d, want %d", got, vacuumFillerRows)
	}
	if got := queryPragmaString(t, db, "journal_mode"); got != "wal" {
		t.Fatalf("journal_mode after conversion = %q, want wal", got)
	}
	closeTestDB(t, db)

	db = openBridgeDBWithVacuum(t, dbPath, fullVacuum)
	defer closeTestDB(t, db)
	if calls != 1 {
		t.Fatalf("full VACUUM ran %d times across two starts, want 1", calls)
	}
	if got := queryPragmaInt(t, db, "auto_vacuum"); got != autoVacuumIncremental {
		t.Fatalf("auto_vacuum after reopen = %d, want %d", got, autoVacuumIncremental)
	}
}

func TestEnsureIncrementalAutoVacuumTruncatesTheWALItsConversionWrote(t *testing.T) {
	t.Parallel()

	dbPath := createLegacyDatabase(t)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	defer closeTestDB(t, db)
	db.SetMaxOpenConns(1)

	if err := ensureIncrementalAutoVacuum(db, runFullVacuum); err != nil {
		t.Fatalf("convert: %v", err)
	}

	info, err := os.Stat(dbPath + "-wal")
	if err != nil {
		t.Fatalf("stat wal: %v", err)
	}
	if info.Size() != 0 {
		t.Fatalf("wal size after conversion = %d, want 0", info.Size())
	}
}

func TestOpenBridgeDBStaysUsableWhenConversionVacuumFails(t *testing.T) {
	t.Parallel()

	dbPath := createLegacyDatabase(t)
	db := openBridgeDBWithVacuum(t, dbPath, func(*sql.DB) error { return errors.New("disk full") })
	defer closeTestDB(t, db)

	if got := queryPragmaInt(t, db, "auto_vacuum"); got != 0 {
		t.Fatalf("auto_vacuum after failed conversion = %d, want 0", got)
	}
	if got := countFillerRows(t, db); got != vacuumFillerRows {
		t.Fatalf("rows after failed conversion = %d, want %d", got, vacuumFillerRows)
	}
	if _, err := db.Exec(`INSERT INTO vacuum_filler (body) VALUES ('after')`); err != nil {
		t.Fatalf("write after failed conversion: %v", err)
	}
}

func TestIncrementalVacuumReturnsFreedPagesToTheDisk(t *testing.T) {
	t.Parallel()

	db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
	defer closeTestDB(t, db)
	createFillerRows(t, db, vacuumFillerRows)
	if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
		t.Fatalf("delete filler: %v", err)
	}
	freeBefore := queryPragmaInt(t, db, "freelist_count")
	pagesBefore := queryPragmaInt(t, db, "page_count")
	if freeBefore < vacuumFillerRows {
		t.Fatalf("freelist_count after delete = %d, want at least %d", freeBefore, vacuumFillerRows)
	}

	freed, err := IncrementalVacuum(context.Background(), db)
	if err != nil {
		t.Fatalf("incremental vacuum: %v", err)
	}

	if got := queryPragmaInt(t, db, "freelist_count"); got != 0 {
		t.Fatalf("freelist_count after vacuum = %d, want 0", got)
	}
	if freed != freeBefore {
		t.Fatalf("freed = %d, want %d", freed, freeBefore)
	}
	if got := queryPragmaInt(t, db, "page_count"); got != pagesBefore-freeBefore {
		t.Fatalf("page_count after vacuum = %d, want %d", got, pagesBefore-freeBefore)
	}
}

func TestOpenBridgeDBReturnsThePreviousSessionsFreePages(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db := openBridgeDBWithVacuum(t, dbPath, runFullVacuum)
	createFillerRows(t, db, vacuumFillerRows)
	if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
		t.Fatalf("delete filler: %v", err)
	}
	if got := queryPragmaInt(t, db, "freelist_count"); got == 0 {
		t.Fatal("freelist_count after delete = 0, want free pages")
	}
	closeTestDB(t, db)

	db = openBridgeDBWithVacuum(t, dbPath, runFullVacuum)
	defer closeTestDB(t, db)
	if got := queryPragmaInt(t, db, "freelist_count"); got != 0 {
		t.Fatalf("freelist_count after reopen = %d, want 0", got)
	}
}

func TestIncrementalVacuumFreesAtMostTheBoundPerPass(t *testing.T) {
	t.Parallel()

	db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
	defer closeTestDB(t, db)
	createFillerRows(t, db, vacuumFillerRows)
	if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
		t.Fatalf("delete filler: %v", err)
	}
	freeBefore := queryPragmaInt(t, db, "freelist_count")

	const bound = 10
	freed, err := incrementalVacuum(context.Background(), db, bound)
	if err != nil {
		t.Fatalf("incremental vacuum: %v", err)
	}

	if freed != bound {
		t.Fatalf("freed = %d, want %d", freed, bound)
	}
	if got := queryPragmaInt(t, db, "freelist_count"); got != freeBefore-bound {
		t.Fatalf("freelist_count = %d, want %d", got, freeBefore-bound)
	}
}

func TestRunIncrementalVacuumLoopReclaimsPagesUntilCancelled(t *testing.T) {
	t.Parallel()

	db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
	defer closeTestDB(t, db)
	createFillerRows(t, db, vacuumFillerRows)
	if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
		t.Fatalf("delete filler: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		RunIncrementalVacuumLoop(ctx, db, 5*time.Millisecond, t.Logf)
		close(done)
	}()

	deadline := time.Now().Add(5 * time.Second)
	for queryPragmaInt(t, db, "freelist_count") != 0 {
		if time.Now().After(deadline) {
			cancel()
			t.Fatal("loop did not reclaim free pages within 5s")
		}
		time.Sleep(5 * time.Millisecond)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("loop did not return after cancel")
	}
}

func TestIncrementalVacuumReturnsASingleRemainingFreePage(t *testing.T) {
	t.Parallel()

	db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
	defer closeTestDB(t, db)
	createFillerRows(t, db, vacuumFillerRows)
	if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
		t.Fatalf("delete filler: %v", err)
	}
	if _, err := incrementalVacuum(context.Background(), db, queryPragmaInt(t, db, "freelist_count")-1); err != nil {
		t.Fatalf("leave one free page: %v", err)
	}
	if got := queryPragmaInt(t, db, "freelist_count"); got != 1 {
		t.Fatalf("freelist_count = %d, want 1", got)
	}

	freed, err := IncrementalVacuum(context.Background(), db)
	if err != nil {
		t.Fatalf("incremental vacuum: %v", err)
	}

	if freed != 1 {
		t.Fatalf("freed = %d, want 1", freed)
	}
	if got := queryPragmaInt(t, db, "freelist_count"); got != 0 {
		t.Fatalf("freelist_count after vacuum = %d, want 0", got)
	}
}

// loopLog collects the lines RunIncrementalVacuumLoop logs, safe for the loop goroutine.
type loopLog struct {
	mu    gosync.Mutex
	lines []string
}

// logf records one formatted line.
func (l *loopLog) logf(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, fmt.Sprintf(format, args...))
}

// snapshot returns a copy of the recorded lines.
func (l *loopLog) snapshot() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string(nil), l.lines...)
}

func TestRunIncrementalVacuumLoopLogsOnlyFailedPasses(t *testing.T) {
	t.Parallel()

	run := func(t *testing.T, db *sql.DB, until func(*loopLog) bool) []string {
		t.Helper()
		log := &loopLog{}
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			RunIncrementalVacuumLoop(ctx, db, 5*time.Millisecond, log.logf)
			close(done)
		}()
		deadline := time.Now().Add(5 * time.Second)
		for !until(log) && time.Now().Before(deadline) {
			time.Sleep(5 * time.Millisecond)
		}
		cancel()
		<-done
		return log.snapshot()
	}

	t.Run("successful passes log nothing", func(t *testing.T) {
		db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
		defer closeTestDB(t, db)
		createFillerRows(t, db, vacuumFillerRows)
		if _, err := db.Exec(`DELETE FROM vacuum_filler`); err != nil {
			t.Fatalf("delete filler: %v", err)
		}
		reclaimed := func(*loopLog) bool { return queryPragmaInt(t, db, "freelist_count") == 0 }
		if lines := run(t, db, reclaimed); len(lines) != 0 {
			t.Fatalf("expected no log lines for successful passes, got %q", lines)
		}
	})

	t.Run("a failed pass is logged", func(t *testing.T) {
		db := openBridgeDBWithVacuum(t, filepath.Join(t.TempDir(), "bridge.db"), runFullVacuum)
		closeTestDB(t, db)
		logged := func(l *loopLog) bool { return len(l.snapshot()) > 0 }
		lines := run(t, db, logged)
		if len(lines) == 0 || !strings.HasPrefix(lines[0], "incremental vacuum: ") {
			t.Fatalf("expected the failed pass to be logged, got %q", lines)
		}
	})
}
