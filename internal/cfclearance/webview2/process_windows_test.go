//go:build windows

package webview2

import (
	"golang.org/x/sys/windows"
)

// stillActive is the exit code Windows reports for a process that has not ended.
const stillActive = 259

// processAlive reports whether pid names a running process.
func processAlive(pid int) bool {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	defer func() { _ = windows.CloseHandle(h) }()
	var code uint32
	if err := windows.GetExitCodeProcess(h, &code); err != nil {
		return false
	}
	return code == stillActive
}
