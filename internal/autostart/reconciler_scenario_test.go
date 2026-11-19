package autostart

import (
	"os"
	"path/filepath"
	"testing"
)

// TestReconcilerWritesTheQuotedCommandOnceThenDeletesOnlyItsOwnValue enables
// auto-start over a registry holding only another app's value, checks the
// quoted executable command is written, re-enables without a second write, and
// disables while leaving the other app's value in place.
func TestReconcilerWritesTheQuotedCommandOnceThenDeletesOnlyItsOwnValue(t *testing.T) {
	t.Parallel()

	registry := &fakeRegistry{values: map[string]string{"Unrelated App": "other.exe"}}
	reconciler := NewReconciler(registry, func() (string, error) {
		return `C:\Program Files\Autoreas Bridge\autoreas-bridge.exe`, nil
	})

	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if got, want := registry.values[RunValueName], `"C:\Program Files\Autoreas Bridge\autoreas-bridge.exe"`; got != want {
		t.Fatalf("Run command = %q, want %q", got, want)
	}
	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("second Reconcile: %v", err)
	}
	if registry.setCalls != 1 {
		t.Fatalf("SetValue calls = %d, want 1: an identical command is not written again", registry.setCalls)
	}

	if err := reconciler.Reconcile(false); err != nil {
		t.Fatalf("Reconcile(false): %v", err)
	}
	if _, exists := registry.values[RunValueName]; exists {
		t.Fatal("expected Bridge Run value to be removed")
	}
	if got := registry.values["Unrelated App"]; got != "other.exe" {
		t.Fatalf("unrelated Run value = %q, want preserved value", got)
	}
}

// TestReconcilerRunningAThrowawayBuildHealsAPoisonedValueAndNeverReplacesAnInstalledOne
// reconciles from a throwaway test build: a Run value pointing at a throwaway
// build is removed while another app's value stays, and an installed command is
// preserved without any write.
func TestReconcilerRunningAThrowawayBuildHealsAPoisonedValueAndNeverReplacesAnInstalledOne(t *testing.T) {
	t.Parallel()

	throwaway := filepath.Join(os.TempDir(), "go-build123", "b001", "autoreas-bridge.test.exe")
	registry := &fakeRegistry{values: map[string]string{
		RunValueName:    `"` + throwaway + `"`,
		"Unrelated App": "other.exe",
	}}
	reconciler := NewReconciler(registry, func() (string, error) { return throwaway, nil })

	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if _, exists := registry.values[RunValueName]; exists {
		t.Fatal("expected the throwaway Run value to be removed")
	}
	if got := registry.values["Unrelated App"]; got != "other.exe" {
		t.Fatalf("unrelated Run value = %q, want preserved value", got)
	}

	installed := `"C:\Program Files\Autoreas Bridge\autoreas-bridge.exe"`
	registry.values[RunValueName] = installed
	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if got := registry.values[RunValueName]; got != installed {
		t.Fatalf("Run command = %q, want the installed command %q preserved", got, installed)
	}
	if registry.setCalls != 0 {
		t.Fatalf("SetValue calls = %d, want 0", registry.setCalls)
	}
}
