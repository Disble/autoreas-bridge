package sync

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// deprecatedMigrationMarker opens the Deprecated paragraph of every
// upgrade-only migration the deprecation register lists.
const deprecatedMigrationMarker = "Deprecated: upgrade-only migration"

// TestDeprecatedMigrationsAreGoneByTheNextMajor is the machine owner of
// docs/architecture/cross-cutting/deprecations.md: upgrade-only migrations stay
// through 2.x and must be deleted before a 3.x release. It reads the real
// wails.json productVersion and fails once its major reaches 3 while any Go
// file under internal/ still carries the deprecation marker.
func TestDeprecatedMigrationsAreGoneByTheNextMajor(t *testing.T) {
	root := findRepositoryRoot(t)
	major := readProductMajor(t, filepath.Join(root, "wails.json"))
	if major < 3 {
		return
	}
	if marked := findDeprecatedMigrations(t, root, "internal"); len(marked) > 0 {
		t.Fatalf("productVersion major is %d, but these upgrade-only migrations are still in the tree; "+
			"delete them and their tests as docs/architecture/cross-cutting/deprecations.md describes:\n%s",
			major, strings.Join(marked, "\n"))
	}
}

// findRepositoryRoot walks up from the package directory to the folder that
// holds wails.json.
func findRepositoryRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("working directory: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "wails.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("no wails.json above the package directory")
		}
		dir = parent
	}
}

// readProductMajor returns the major number of info.productVersion.
func readProductMajor(t *testing.T, path string) int {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var config struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(raw, &config); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	majorText, _, _ := strings.Cut(config.Info.ProductVersion, ".")
	major, err := strconv.Atoi(majorText)
	if err != nil {
		t.Fatalf("productVersion %q has no numeric major: %v", config.Info.ProductVersion, err)
	}
	return major
}

// findDeprecatedMigrations lists, as root-relative path:line, every line of
// Go source under root/dir that carries the marker, skipping this file, which
// only names it.
func findDeprecatedMigrations(t *testing.T, root, dir string) []string {
	t.Helper()
	var marked []string
	err := fs.WalkDir(os.DirFS(root), dir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") ||
			entry.Name() == "deprecated_migrations_test.go" {
			return walkErr
		}
		source, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			return err
		}
		for index, line := range strings.Split(string(source), "\n") {
			if strings.Contains(line, deprecatedMigrationMarker) {
				marked = append(marked, fmt.Sprintf("%s:%d", path, index+1))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("scan %s: %v", filepath.Join(root, dir), err)
	}
	return marked
}
