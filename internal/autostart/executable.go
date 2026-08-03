package autostart

import (
	"os"
	"path/filepath"
	"strings"
)

// isRegistrableExecutable reports whether path looks like a real installed (or
// released) Bridge binary rather than a throwaway build.
//
// This guard exists because registration is runtime behavior: every test that
// drives App.startup, and every `wails dev` session, would otherwise write its
// own short-lived binary path into the user's HKCU Run value and silently break
// login launch once that binary is deleted. A `go test ./...` run was observed
// leaving `%TEMP%\go-build.../b001\autoreas-bridge.test.exe` registered.
func isRegistrableExecutable(path string) bool {
	if path == "" {
		return false
	}
	normalized := strings.ToLower(filepath.ToSlash(path))
	base := strings.TrimSuffix(filepath.Base(normalized), ".exe")

	if strings.HasSuffix(base, ".test") || strings.HasSuffix(base, "-dev") {
		return false
	}
	for segment := range strings.SplitSeq(normalized, "/") {
		if strings.HasPrefix(segment, "go-build") {
			return false
		}
	}
	return !isUnderTempDir(normalized)
}

// isUnderTempDir reports whether an already-normalized path lives inside the
// OS temporary directory, where both go test binaries and dev builds land.
func isUnderTempDir(normalized string) bool {
	temp := strings.ToLower(filepath.ToSlash(os.TempDir()))
	if temp == "" {
		return false
	}
	return strings.HasPrefix(normalized, strings.TrimSuffix(temp, "/")+"/")
}
