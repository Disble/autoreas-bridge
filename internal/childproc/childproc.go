// Package childproc starts the console programs Bridge runs behind the user's back, such as
// ffprobe and the Cloudflare solver child.
//
// Bridge is a GUI application without a console. On Windows, a GUI process that starts a console
// program gets a new console window for it, which flashes on screen for as long as the program
// runs. Every background console program therefore starts through Background, which suppresses
// that window. tools/checkarchitecture rejects a direct os/exec command anywhere else in
// production code; see docs/architecture/cross-cutting/child-processes.md.
package childproc

import (
	"context"
	"os/exec"
)

// Background returns a command for a console program that runs without a visible window. The
// arguments travel as separate process arguments, never through a shell. Callers configure
// stdout, Cancel or WaitDelay on the returned command as usual, but must not replace its
// SysProcAttr.
func Background(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	hideConsole(cmd)
	return cmd
}
