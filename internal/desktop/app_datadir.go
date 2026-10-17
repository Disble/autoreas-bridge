package desktop

import (
	"fmt"
	"hash/fnv"
	"os"
	"strings"

	bridgeSync "autoreas-bridge/internal/sync"
)

// getenv returns the environment seam, falling back to os.Getenv.
func (a *App) getenv() func(string) string {
	if a.getenvFn != nil {
		return a.getenvFn
	}
	return os.Getenv
}

// dataDirOverridden reports whether this process runs against a copy of the
// data directory (bridgeSync.DataDirEnvVar) rather than the everyday one.
func (a *App) dataDirOverridden() bool {
	_, overridden := bridgeSync.DataDirOverride(a.getenv())
	return overridden
}

// singleInstanceLockIDFor keeps the shipped lock id for the everyday bridge and
// derives a distinct one per data directory copy. Sharing the shipped id would
// make a development build hand off to the running everyday bridge and exit.
// The directory is lower-cased because Windows paths are case-insensitive.
func singleInstanceLockIDFor(getenv func(string) string) string {
	dir, overridden := bridgeSync.DataDirOverride(getenv)
	if !overridden {
		return singleInstanceLockID
	}
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(strings.ToLower(dir)))
	return fmt.Sprintf("%s-%08x", singleInstanceLockID, hash.Sum32())
}
