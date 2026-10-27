package main

import (
	"fmt"
	"strings"
)

// childProcessLiteral is the os/exec constructor a production file must not call directly. The
// raw substring matches both exec.Command and exec.CommandContext.
const childProcessLiteral = "exec.Command"

// guiLaunchFiles start GUI programs the user is meant to see (JDownloader, Windows Explorer). They
// are the only production files allowed to build a command without childproc, because hiding
// their window would hide the program itself.
var guiLaunchFiles = map[string]bool{
	"internal/download/jdownloader/launcher.go": true,
	"internal/desktop/app_defaults.go":          true,
}

// childProcessViolations reports a production Go file that builds a command directly instead of
// through childproc.Background. Bridge has no console, so on Windows a console program started any
// other way flashes a console window (docs/architecture/cross-cutting/child-processes.md).
func childProcessViolations(path, text string) []string {
	if !strings.Contains(text, childProcessLiteral) || isChildProcessExempt(path) {
		return nil
	}
	return []string{fmt.Sprintf("%s uses %s: start background console programs with childproc.Background so no console window flashes", path, childProcessLiteral)}
}

// isChildProcessExempt reports whether path may build a command directly: non-Go sources, tests,
// developer tools run from a terminal, the childproc package, and the GUI launch allowlist.
func isChildProcessExempt(path string) bool {
	return !strings.HasSuffix(path, ".go") ||
		strings.HasSuffix(path, "_test.go") ||
		strings.HasPrefix(path, "tools/") ||
		strings.HasPrefix(path, "internal/childproc/") ||
		guiLaunchFiles[path]
}
