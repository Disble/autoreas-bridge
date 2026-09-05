// Package tray provides system-tray integration for the bridge.
package tray

// Enables the //go:embed directive below. The package is never referenced by
// name, so the import exists only to make the directive legal.
import _ "embed"

// DefaultIcon is the embedded system-tray icon.
//
//go:embed tray-icon.ico
var DefaultIcon []byte
