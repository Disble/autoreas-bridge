package main

import (
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// errDatabasePathRequired is returned when no database was named. Like
// checktruncation, this tool deliberately imports nothing from internal/: a
// check that imports the domain it checks drags that whole package graph into
// its build, and this one only needs a file path.
var errDatabasePathRequired = errors.New("no database given: pass -db <path to bridge.db>")

// committedWritesQuery selects the anime touched by every committed write.
const committedWritesQuery = `
	SELECT anime_id FROM anime_write_operations WHERE status = 'committed'`

// entityEventsQuery selects every runtime event that names an entity. Rows
// without one cannot cover a write and are filtered in SQL so the ratio is not
// computed over transport chatter.
const entityEventsQuery = `
	SELECT entity_id, COALESCE(event_type, '')
	FROM runtime_events
	WHERE entity_id IS NOT NULL AND entity_id <> ''`

func main() {
	dbPath := flag.String("db", "", "path to bridge.db (required)")
	threshold := flag.Float64("threshold", 1.0, "minimum acceptable coverage ratio, from 0 to 1")
	flag.Parse()

	coverage, err := run(*dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "checkeventcoverage: %v\n", err)
		os.Exit(exitFailedToRun)
	}

	report(os.Stdout, coverage)
	os.Exit(exitCodeFor(coverage, *threshold))
}

const (
	// exitOK reports coverage at or above the threshold, or nothing to measure.
	exitOK = 0
	// exitBelowThreshold reports a measurable coverage ratio under the threshold.
	exitBelowThreshold = 1
	// exitFailedToRun reports that the check could not run at all, which is
	// distinct from a check that ran and found poor coverage.
	exitFailedToRun = 2
)

// exitCodeFor decides the process exit status.
//
// An unmeasurable run exits 0 rather than failing: a database with no committed
// writes has nothing to cover, and failing there would report a broken write
// path on a fresh install. That is the same "clean for the wrong reason" trap
// this family of checks exists to avoid, in the opposite direction.
func exitCodeFor(coverage Coverage, threshold float64) int {
	if !coverage.Measurable() {
		return exitOK
	}
	if coverage.Ratio() < threshold {
		return exitBelowThreshold
	}
	return exitOK
}

// run opens the bridge database and measures real-entity event coverage.
func run(dbPath string) (Coverage, error) {
	if dbPath == "" {
		return Coverage{}, errDatabasePathRequired
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return Coverage{}, fmt.Errorf("open %s: %w", dbPath, err)
	}
	defer func() {
		_ = db.Close()
	}()

	writes, err := scanWrites(db)
	if err != nil {
		return Coverage{}, err
	}
	events, err := scanEvents(db)
	if err != nil {
		return Coverage{}, err
	}
	return ComputeCoverage(writes, events), nil
}

// scanWrites loads every committed write operation's anime.
func scanWrites(db *sql.DB) ([]WriteRecord, error) {
	rows, err := db.Query(committedWritesQuery)
	if err != nil {
		return nil, fmt.Errorf("query committed write operations: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	writes := []WriteRecord{}
	for rows.Next() {
		var write WriteRecord
		if err := rows.Scan(&write.AnimeID); err != nil {
			return nil, fmt.Errorf("scan write operation: %w", err)
		}
		writes = append(writes, write)
	}
	return writes, rows.Err()
}

// scanEvents loads every runtime event that names an entity.
func scanEvents(db *sql.DB) ([]EventRecord, error) {
	rows, err := db.Query(entityEventsQuery)
	if err != nil {
		return nil, fmt.Errorf("query runtime events: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	events := []EventRecord{}
	for rows.Next() {
		var event EventRecord
		if err := rows.Scan(&event.EntityID, &event.EventType); err != nil {
			return nil, fmt.Errorf("scan runtime event: %w", err)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

// report prints the ratio and the counts behind it. The counts are printed
// because a ratio with no denominator invites the same mistake this tool
// exists to prevent: reading a number without knowing what it measured.
func report(out io.Writer, coverage Coverage) {
	if !coverage.Measurable() {
		_, _ = fmt.Fprintln(out, "checkeventcoverage: no committed anime writes; nothing to cover")
		return
	}
	_, _ = fmt.Fprintf(out,
		"checkeventcoverage: %.2f real-entity event coverage (%d of %d written anime emitted a %q event)\n",
		coverage.Ratio(), coverage.Covered, coverage.CommittedWrites, coveringEventType)
}
