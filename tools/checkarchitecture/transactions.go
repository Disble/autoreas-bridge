package main

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// transactionCallMarkers are the raw texts of a transaction opened by hand.
// Like the owned-table rule this is a substring scan, not a type check: it
// cannot tell a *sql.DB receiver from another one, so a match anywhere in a
// Go file, comments included, counts.
var transactionCallMarkers = []string{".BeginTx(", ".Begin("}

// transactionBaseline lists the files that opened a transaction by hand
// before persistence.InTx existed. It may shrink but never grow: a file
// outside it is rejected, and an entry whose file no longer opens a
// transaction is reported so it is removed. Production opens SQLite with one
// connection, where a transaction left open by a hand-rolled conditional
// rollback blocks every later query, so new code uses persistence.InTx.
var transactionBaseline = []string{
	"internal/activity/store.go",
	"internal/activity/store_test.go",
	"internal/download/sqlite_store.go",
	"internal/download/sqlite_store_runs.go",
	"internal/download/sqlite_store_schedule.go",
	"internal/notification/center/sqlite_store.go",
	"internal/notification/center/sqlite_store_lifecycle.go",
	"internal/notification/center/sqlite_store_list_test.go",
	"internal/notification/center/sqlite_store_test.go",
	"internal/observability/eventlog/store.go",
	"internal/observability/requestcapture/store.go",
	"internal/observability/telemetry/store_test.go",
	"internal/season/backup_import.go",
	"internal/sync/anime_snapshot_store.go",
	"internal/sync/backup_import.go",
	"internal/sync/schema_migrations.go",
	"internal/sync/vocabulary_migration_tables.go",
	"internal/sync/watch_history_backfill.go",
	"internal/sync/write_base_lifecycle.go",
	"internal/sync/write_base_store.go",
	"internal/watchhistory/backup_import.go",
	"internal/watchhistory/store.go",
	"internal/watchhistory/store_test.go",
}

// opensTransaction reports whether a Go file outside the allowed owners
// opens a transaction by hand. internal/persistence owns InTx, and this
// checker carries the markers as string constants.
func opensTransaction(path, text string) bool {
	if filepath.Ext(path) != ".go" || isTransactionOwnerFile(path) {
		return false
	}
	return slices.ContainsFunc(transactionCallMarkers, func(marker string) bool {
		return strings.Contains(text, marker)
	})
}

// isTransactionOwnerFile reports whether path may open transactions by hand.
func isTransactionOwnerFile(path string) bool {
	return strings.Contains(path, "/internal/persistence/") ||
		strings.HasPrefix(path, "internal/persistence/") ||
		strings.Contains(path, "/tools/checkarchitecture/") ||
		strings.HasPrefix(path, "tools/checkarchitecture/")
}

// transactionViolations reports a visited file that breaks the rule: a hand
// opened transaction outside the baseline, or a baseline file that no longer
// opens one.
func transactionViolations(path, text string) []string {
	opens := opensTransaction(path, text)
	listed := slices.Contains(transactionBaseline, path)
	switch {
	case opens && !listed:
		return []string{fmt.Sprintf("%s opens a transaction by hand; use persistence.InTx", path)}
	case !opens && listed:
		return []string{fmt.Sprintf("%s no longer opens a transaction by hand; remove it from transactionBaseline", path)}
	default:
		return nil
	}
}
