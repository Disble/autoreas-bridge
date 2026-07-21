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
		text := string(content)
		if strings.Contains(text, "activity_log") && !isActivityBoundaryFile(normalized) {
			violations = append(violations, fmt.Sprintf("%s references activity_log outside internal/activity", normalized))
		}
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
