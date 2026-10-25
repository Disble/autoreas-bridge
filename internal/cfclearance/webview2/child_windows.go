//go:build windows

package webview2

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// runChild runs the solver child to completion with its stdout copied to stdout. The child is
// created without a console window and confined, together with every browser process it
// spawns, to a job object that kills its members when the job closes: at context expiry, and
// again when this function returns.
func runChild(ctx context.Context, exe string, args []string, stdout io.Writer) error {
	job, err := newKillOnCloseJob()
	if err != nil {
		return err
	}
	defer job.close()
	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	cmd.Stdout = stdout
	cmd.WaitDelay = waitDelay
	cmd.Cancel = func() error {
		job.close()
		return cmd.Process.Kill()
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("cfclearance webview2: start solver child: %w", err)
	}
	if err := job.assign(cmd.Process.Pid); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return err
	}
	return cmd.Wait()
}

// jobHandle owns the kill-on-close job the child runs in.
type jobHandle struct {
	handle windows.Handle
}

// newKillOnCloseJob creates a job whose last handle closing kills every member process.
func newKillOnCloseJob() (*jobHandle, error) {
	handle, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, fmt.Errorf("cfclearance webview2: create job object: %w", err)
	}
	job := &jobHandle{handle: handle}
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job.handle, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		job.close()
		return nil, fmt.Errorf("cfclearance webview2: confine job object: %w", err)
	}
	return job, nil
}

// assign adds the started child to the job, so everything it spawns afterwards is inside too.
func (j *jobHandle) assign(pid int) error {
	process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return fmt.Errorf("cfclearance webview2: open solver child: %w", err)
	}
	defer func() { _ = windows.CloseHandle(process) }()
	if err := windows.AssignProcessToJobObject(j.handle, process); err != nil {
		return fmt.Errorf("cfclearance webview2: add solver child to its job object: %w", err)
	}
	return nil
}

// close releases the job handle, killing every member still running. Safe to call twice.
func (j *jobHandle) close() {
	if j.handle != 0 {
		_ = windows.CloseHandle(j.handle)
		j.handle = 0
	}
}
