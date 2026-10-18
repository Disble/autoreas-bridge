package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	// Registers the "sqlite" driver with database/sql. Nothing in this file
	// references the package, so the import exists purely for that init side effect
	// and removing it turns every sql.Open("sqlite", ...) here into a runtime error.
	_ "modernc.org/sqlite"
)

// copyName is the file the bridge opens inside a data directory.
const copyName = "bridge.db"

// errTargetRequired is returned when no copy directory was named.
var errTargetRequired = errors.New("no copy directory given: pass -to <absolute directory>")

// copyDatabase writes a consistent copy of the database at src into dstDir and
// returns the copy's path. It replaces any earlier copy there.
//
// The source is opened read-only and copied with VACUUM INTO, which reads a
// consistent snapshot while the everyday bridge keeps writing to it. The live
// directory is refused as a target: replacing the live file is the one
// mistake this tool exists to make impossible.
func copyDatabase(src, dstDir string) (string, error) {
	if strings.TrimSpace(dstDir) == "" {
		return "", errTargetRequired
	}
	if !filepath.IsAbs(dstDir) {
		return "", fmt.Errorf("copy directory must be an absolute path, got %q", dstDir)
	}
	dstDir = filepath.Clean(dstDir)
	if strings.EqualFold(dstDir, filepath.Dir(filepath.Clean(src))) {
		return "", fmt.Errorf("copy directory %q is the live data directory; choose another one", dstDir)
	}
	if _, err := os.Stat(src); err != nil {
		return "", fmt.Errorf("live database not found at %q: %w", src, err)
	}
	if err := os.MkdirAll(dstDir, 0o755); err != nil {
		return "", fmt.Errorf("create copy directory: %w", err)
	}

	dst := filepath.Join(dstDir, copyName)
	// VACUUM INTO refuses an existing file, and stale WAL sidecars next to a
	// fresh copy would be replayed into it on first open.
	for _, stale := range []string{dst, dst + "-wal", dst + "-shm"} {
		if err := os.Remove(stale); err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("remove previous copy %q: %w", stale, err)
		}
	}

	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(src)+"?mode=ro")
	if err != nil {
		return "", fmt.Errorf("open live database read-only: %w", err)
	}
	defer func() { _ = db.Close() }()
	if _, err := db.Exec("VACUUM INTO ?", dst); err != nil {
		return "", fmt.Errorf("copy %q into %q: %w", src, dst, err)
	}
	return dst, nil
}
