// Package requestcapture exposes a read-only MCP sidecar surface over captured bridge requests.
package requestcapture

import bridgeSync "autoreas-bridge/internal/sync"

// ResolveBridgeDBPath returns the existing bridge SQLite database path for the sidecar.
func ResolveBridgeDBPath() (string, error) {
	return bridgeSync.ResolveExistingBridgeDBPath()
}
