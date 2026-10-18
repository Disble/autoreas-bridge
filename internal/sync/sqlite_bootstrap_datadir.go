package sync

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DataDirEnvVar names a directory that replaces the platform data directory.
//
// It exists so a development build can run against a copy of the database
// while the everyday bridge keeps the real one (docs/observability/
// development-database.md). Unset, the bridge behaves exactly as before.
const DataDirEnvVar = "AUTOREAS_DATA_DIR"

// DataDirOverride returns the cleaned directory named by DataDirEnvVar and
// whether one is set. A nil getenv means no override.
func DataDirOverride(getenv func(string) string) (string, bool) {
	if getenv == nil {
		return "", false
	}
	value := strings.TrimSpace(getenv(DataDirEnvVar))
	if value == "" {
		return "", false
	}
	return filepath.Clean(value), true
}

// dataDir resolves the directory holding bridge.db: the override when set,
// otherwise the platform data directory.
//
// An unsafe override is an error, never a silent fall back to the real data:
// a relative path would follow whatever directory the process started in, and
// naming the live directory would let a second instance open the real file.
func (b SQLiteBootstrap) dataDir() (string, error) {
	userConfigDir := b.userConfigDir
	if userConfigDir == nil {
		userConfigDir = os.UserConfigDir
	}
	getenv := b.getenv
	if getenv == nil {
		getenv = os.Getenv
	}

	override, overridden := DataDirOverride(getenv)
	if overridden && !filepath.IsAbs(override) {
		return "", fmt.Errorf("%s must be an absolute path, got %q", DataDirEnvVar, override)
	}

	baseDir, err := userConfigDir()
	if err != nil {
		return "", err
	}
	liveDir := filepath.Join(baseDir, bridgeDataDirName, bridgeDataSubdir)
	if !overridden {
		return liveDir, nil
	}
	if strings.EqualFold(override, liveDir) {
		return "", fmt.Errorf("%s names the live data directory %q; point it at a copy", DataDirEnvVar, liveDir)
	}
	return override, nil
}
