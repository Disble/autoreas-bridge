//go:build !windows

package webview2

// processAlive is never consulted off Windows, where no child is launched.
func processAlive(int) bool { return false }

// runRealEngineChild is never reached off Windows, where the harness runs no real engine.
func runRealEngineChild() { panic("real engine child requested off Windows") }
