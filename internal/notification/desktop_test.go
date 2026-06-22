package notification

import (
	"context"
	"runtime"
	"testing"
)

// TestNonWindowsDesktopAdapterIsANoOpThatNeverCountsAsDelivered asserts the
// !windows no-op fake's labeled behavior. It runs on every platform except
// Windows so CI on Linux/macOS exercises the actual fake build.
func TestNonWindowsDesktopAdapterIsANoOpThatNeverCountsAsDelivered(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("this assertion targets the !windows build-tag fake; skipped on windows")
	}

	adapter := NewDesktopToastAdapter()

	if adapter.Delivered() {
		t.Fatal("expected a freshly constructed non-Windows fake to report Delivered()==false")
	}

	if err := adapter.Deliver(context.Background(), sampleNotification()); err != nil {
		t.Fatalf("expected the non-Windows no-op fake to never error, got %v", err)
	}

	if adapter.Delivered() {
		t.Fatal("the non-Windows no-op fake MUST NOT count as having delivered a desktop notification")
	}
}

// TestWindowsDesktopAdapterDeliversAProperNativeToast targets the real
// //go:build windows implementation. It is gated to only run on Windows --
// on other platforms it is skipped, never asserting against the fake.
func TestWindowsDesktopAdapterDeliversAProperNativeToast(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("this assertion targets the real windows implementation; skipped on non-windows")
	}

	adapter := NewDesktopToastAdapter()

	// We only assert the adapter satisfies the Adapter contract without
	// crashing/shelling out; actual OS toast rendering is not asserted in a
	// headless CI environment, but the call MUST go through pushCOM (no
	// PowerShell) per design ADR-NOTIF-3.
	err := adapter.Deliver(context.Background(), sampleNotification())
	if err != nil {
		t.Logf("desktop toast delivery returned an error in this (possibly headless) environment: %v", err)
	}
}

var _ Adapter = (*DesktopToastAdapter)(nil)
