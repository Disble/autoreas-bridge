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

// errDatabasePathRequired is returned when no database was named. The tool
// deliberately does NOT import the bridge's own path resolution: a check that
// imports the domain it checks drags that whole package graph into its build,
// and this one only needs a file path.
var errDatabasePathRequired = errors.New("no database given: pass -db <path to bridge.db>")

// committedOperationsQuery selects every committed write oldest-first, so the
// printed findings read as a chronological recovery list.
const committedOperationsQuery = `
	SELECT operation_id, anime_id, COALESCE(committed_at_ms, 0),
	       base_snapshot_json, desired_snapshot_json
	FROM anime_write_operations
	WHERE status = 'committed'
	ORDER BY committed_at_ms ASC, operation_id ASC`

func main() {
	dbPath := flag.String("db", "", "path to bridge.db (required)")
	flag.Parse()

	findings, err := run(*dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "checktruncation: %v\n", err)
		os.Exit(2)
	}

	report(os.Stdout, findings)
	if len(findings) > 0 {
		os.Exit(1)
	}
}

// run opens the bridge database and scans every committed write operation.
func run(dbPath string) ([]Finding, error) {
	resolved, err := resolveDBPath(dbPath)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", resolved)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", resolved, err)
	}
	defer func() {
		_ = db.Close()
	}()

	return scanCommittedOperations(db)
}

// resolveDBPath validates the requested database path. Naming the database is
// the caller's job so this tool stays a leaf with no bridge dependencies.
func resolveDBPath(flagValue string) (string, error) {
	if flagValue == "" {
		return "", errDatabasePathRequired
	}
	return flagValue, nil
}

// scanCommittedOperations loads every committed write and hands the whole set
// to Analyze. A row that fails to scan aborts the run rather than being
// skipped: a check that silently ignores unreadable rows reports "clean" for
// the wrong reason.
func scanCommittedOperations(db *sql.DB) ([]Finding, error) {
	rows, err := db.Query(committedOperationsQuery)
	if err != nil {
		return nil, fmt.Errorf("query committed write operations: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	operations := []Operation{}
	for rows.Next() {
		var operation Operation
		if err := rows.Scan(
			&operation.OperationID,
			&operation.AnimeID,
			&operation.CommittedAtMs,
			&operation.BaseSnapshotJSON,
			&operation.DesiredSnapshotJSON,
		); err != nil {
			return nil, fmt.Errorf("scan write operation: %w", err)
		}
		operations = append(operations, operation)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read write operations: %w", err)
	}
	return Analyze(operations)
}

// report prints one line per finding, in a shape that can be read directly as
// the list of anime whose data needs repairing.
func report(out io.Writer, findings []Finding) {
	if len(findings) == 0 {
		_, _ = fmt.Fprintln(out, "checktruncation: no silent collection truncations found")
		return
	}

	_, _ = fmt.Fprintf(out, "checktruncation: %d silent collection truncation(s) found\n", len(findings))
	for _, finding := range findings {
		_, _ = fmt.Fprintf(out, "  anime=%s field=%s committed_at_ms=%d operation=%s\n",
			finding.AnimeID, finding.Field, finding.CommittedAtMs, finding.OperationID)
	}
}
