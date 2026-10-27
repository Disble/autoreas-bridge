//go:build windows

package childproc

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// hideConsole keeps the console program cmd starts from showing a window: CREATE_NO_WINDOW runs
// it without a console window, and HideWindow starts any window it would still create hidden.
func hideConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
}
