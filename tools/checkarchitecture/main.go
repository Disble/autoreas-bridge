// Package main validates source boundaries in the bridge architecture.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var scannedExtensions = map[string]bool{
	".go":  true,
	".ts":  true,
	".tsx": true,
}

// ownedTableRule declares one table-ownership boundary: literal is the raw
// table-name substring that must not appear outside its owning package's
// source text (comments included -- this is a raw strings.Contains scan,
// not a parser), and isBoundaryFile reports whether a repository-relative
// path is inside that boundary.
type ownedTableRule struct {
	literal        string
	isBoundaryFile func(path string) bool
}

// ownedTableRules is the registry of owned-table boundaries
// tools/checkarchitecture enforces. Adding a new bounded context's table
// means adding one entry here (design.md D1's second owned-table rule for
// watch_history / internal/watchhistory).
var ownedTableRules = []ownedTableRule{
	{literal: "activity_log", isBoundaryFile: isActivityBoundaryFile},
	{literal: "watch_history", isBoundaryFile: isWatchHistoryBoundaryFile},
}

func main() {
	if err := run("."); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run executes the architecture checks against the operating-system filesystem.
func run(root string) error {
	return runWithArchitectureFS(root, osArchitectureFS{})
}

// runWithArchitectureFS runs the architecture checks against a filesystem port.
func runWithArchitectureFS(root string, source architectureFS) error {
	var violations []string
	err := walkArchitectureFiles(root, source, func(path string, content []byte) error {
		normalized, err := relativePath(root, path)
		if err != nil {
			return err
		}
		violations = append(violations, ownedTableViolations(normalized, string(content))...)
		return nil
	})
	if err != nil {
		return err
	}
	if len(violations) > 0 {
		sort.Strings(violations)
		return fmt.Errorf("architecture violations:\n- %s", strings.Join(violations, "\n- "))
	}
	return nil
}

// ownedTableViolations reports every owned-table rule a file's source text
// violates: the rule's literal table name appears in text while path is
// outside the boundary that rule declares.
func ownedTableViolations(path, text string) []string {
	var violations []string
	for _, rule := range ownedTableRules {
		if strings.Contains(text, rule.literal) && !rule.isBoundaryFile(path) {
			violations = append(violations, fmt.Sprintf("%s references %s outside its owning package", path, rule.literal))
		}
	}
	return violations
}

// relativePath converts a filesystem path to a normalized repository-relative path.
func relativePath(root, path string) (string, error) {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return "", fmt.Errorf("resolve architecture-check path %q: %w", path, err)
	}
	return filepath.ToSlash(relative), nil
}

// isActivityBoundaryFile reports whether activity-log access is allowed by policy.
func isActivityBoundaryFile(path string) bool {
	return strings.Contains(path, "/internal/activity/") ||
		strings.HasPrefix(path, "internal/activity/") ||
		strings.HasSuffix(path, "/internal/sync/sqlite_bootstrap.go") ||
		path == "internal/sync/sqlite_bootstrap.go" ||
		strings.Contains(path, "/tools/checkarchitecture/") ||
		strings.HasPrefix(path, "tools/checkarchitecture/")
}

// isWatchHistoryBoundaryFile reports whether watch_history access is
// allowed by policy. Unlike activity_log, no sync-bootstrap exception
// exists: the backfill driver registers the table through
// watchhistory.SchemaTables() and never writes the literal itself, using
// camelCase identifiers instead (design.md D1, Note C).
func isWatchHistoryBoundaryFile(path string) bool {
	return strings.Contains(path, "/internal/watchhistory/") ||
		strings.HasPrefix(path, "internal/watchhistory/") ||
		strings.Contains(path, "/tools/checkarchitecture/") ||
		strings.HasPrefix(path, "tools/checkarchitecture/")
}

// shouldSkipDir reports whether directory traversal should skip a path.
func shouldSkipDir(path string) bool {
	normalized := filepath.ToSlash(path)
	switch {
	case normalized == ".":
		return false
	case strings.Contains(normalized, "/.git"):
		return true
	case strings.Contains(normalized, "/frontend/dist"):
		return true
	case strings.Contains(normalized, "/frontend/node_modules"):
		return true
	case strings.Contains(normalized, "/node_modules"):
		return true
	default:
		return false
	}
}
