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

func run(root string) error {
	return runWithArchitectureFS(root, osArchitectureFS{})
}

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
		if filepath.Ext(path) == ".go" {
			legacyViolations, checkErr := checkLegacyBoundary(normalized, content)
			if checkErr != nil {
				return checkErr
			}
			violations = append(violations, legacyViolations...)
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

func relativePath(root, path string) (string, error) {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return "", fmt.Errorf("resolve architecture-check path %q: %w", path, err)
	}
	return filepath.ToSlash(relative), nil
}

func isActivityBoundaryFile(path string) bool {
	return strings.Contains(path, "/internal/activity/") ||
		strings.HasPrefix(path, "internal/activity/") ||
		strings.HasSuffix(path, "/internal/sync/sqlite_bootstrap.go") ||
		path == "internal/sync/sqlite_bootstrap.go" ||
		strings.Contains(path, "/tools/checkarchitecture/") ||
		strings.HasPrefix(path, "tools/checkarchitecture/")
}

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
