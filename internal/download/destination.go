package download

import (
	"strings"

	"autoreas-bridge/internal/pathutil"
)

// ResolveDestination returns the deterministic destination shared by readiness and execution.
// It never checks or creates a directory.
func ResolveDestination(explicit *string, downloadsRoot, animeName string) string {
	if explicit != nil && strings.TrimSpace(*explicit) != "" {
		return *explicit
	}
	return pathutil.DeriveFolder(downloadsRoot, animeName)
}
