package main

import (
	"fmt"
	"os"
	"path/filepath"
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
	var violations []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if shouldSkipDir(path) {
				return filepath.SkipDir
			}
			return nil
		}
		if !scannedExtensions[filepath.Ext(path)] {
			return nil
		}
		normalized := filepath.ToSlash(path)
		content, err := os.ReadFile(path)
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
		return fmt.Errorf("architecture violations:\n- %s", strings.Join(violations, "\n- "))
	}
	return nil
}

func isActivityBoundaryFile(path string) bool {
	return strings.Contains(path, "/internal/activity/") ||
		strings.HasPrefix(path, "internal/activity/") ||
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
