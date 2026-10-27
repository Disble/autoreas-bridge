//go:build !windows

package childproc

import "os/exec"

// hideConsole does nothing outside Windows: no other platform opens a window for a console child.
func hideConsole(*exec.Cmd) {}
