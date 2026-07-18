// Package tray provides system-tray integration for the bridge.
package tray

import _ "embed"

// DefaultIcon is the embedded system-tray icon.
//
//go:embed tray-icon.ico
var DefaultIcon []byte
