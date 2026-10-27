//go:build windows

package childproc

import (
	"context"
	"testing"

	"golang.org/x/sys/windows"
)

// TestBackgroundHidesTheConsoleWindow pins the contract every background console program relies
// on: the command is created without a console window and starts hidden, and it still runs the
// requested program with its arguments intact.
func TestBackgroundHidesTheConsoleWindow(t *testing.T) {
	t.Parallel()

	cmd := Background(context.Background(), "cmd", "/c", "exit 7")

	if cmd.SysProcAttr == nil {
		t.Fatal("SysProcAttr is nil: the console program would open a visible window")
	}
	if cmd.SysProcAttr.CreationFlags&windows.CREATE_NO_WINDOW == 0 {
		t.Errorf("CreationFlags = %#x, want CREATE_NO_WINDOW set", cmd.SysProcAttr.CreationFlags)
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("HideWindow = false, want true")
	}

	err := cmd.Run()
	if cmd.ProcessState == nil || cmd.ProcessState.ExitCode() != 7 {
		t.Fatalf("Run() = %v, want the program to run and exit with code 7", err)
	}
}
