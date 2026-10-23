//go:build !windows

package webview2

// processAlive is never consulted off Windows, where no child is launched.
func processAlive(int) bool { return false }
