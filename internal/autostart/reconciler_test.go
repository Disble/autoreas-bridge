package autostart

import (
	"errors"
	"testing"
)

func TestReconcilerEnabledWritesQuotedExecutableCommand(t *testing.T) {
	t.Parallel()

	registry := &fakeRegistry{}
	reconciler := NewReconciler(registry, func() (string, error) {
		return `C:\Program Files\Autoreas Bridge\autoreas-bridge.exe`, nil
	})

	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if got, want := registry.values[RunValueName], `"C:\Program Files\Autoreas Bridge\autoreas-bridge.exe"`; got != want {
		t.Fatalf("Run command = %q, want %q", got, want)
	}
}

func TestReconcilerDisabledDeletesOnlyBridgeValue(t *testing.T) {
	t.Parallel()

	registry := &fakeRegistry{values: map[string]string{
		RunValueName:    "bridge.exe",
		"Unrelated App": "other.exe",
	}}
	reconciler := NewReconciler(registry, func() (string, error) { return "bridge.exe", nil })

	if err := reconciler.Reconcile(false); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if _, exists := registry.values[RunValueName]; exists {
		t.Fatal("expected Bridge Run value to be removed")
	}
	if got := registry.values["Unrelated App"]; got != "other.exe" {
		t.Fatalf("unrelated Run value = %q, want preserved value", got)
	}
}

func TestReconcilerIsIdempotent(t *testing.T) {
	t.Parallel()

	registry := &fakeRegistry{values: map[string]string{RunValueName: `"C:\Bridge\bridge.exe"`}}
	reconciler := NewReconciler(registry, func() (string, error) { return `C:\Bridge\bridge.exe`, nil })

	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("first Reconcile: %v", err)
	}
	if err := reconciler.Reconcile(true); err != nil {
		t.Fatalf("second Reconcile: %v", err)
	}
	if registry.setCalls != 0 {
		t.Fatalf("SetValue calls = %d, want 0", registry.setCalls)
	}
}

func TestReconcilerReturnsRegistryFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		enabled  bool
		registry *fakeRegistry
	}{
		{name: "read", enabled: true, registry: &fakeRegistry{getErr: errors.New("read unavailable")}},
		{name: "write", enabled: true, registry: &fakeRegistry{setErr: errors.New("write unavailable")}},
		{name: "delete", enabled: false, registry: &fakeRegistry{
			values:    map[string]string{RunValueName: "bridge.exe"},
			deleteErr: errors.New("delete unavailable"),
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reconciler := NewReconciler(tt.registry, func() (string, error) { return "bridge.exe", nil })

			if err := reconciler.Reconcile(tt.enabled); err == nil {
				t.Fatal("expected registry failure")
			}
		})
	}
}

type fakeRegistry struct {
	values    map[string]string
	getErr    error
	setErr    error
	deleteErr error
	setCalls  int
}

func (r *fakeRegistry) GetValue(name string) (string, bool, error) {
	if r.getErr != nil {
		return "", false, r.getErr
	}
	value, exists := r.values[name]
	return value, exists, nil
}

func (r *fakeRegistry) SetValue(name, value string) error {
	if r.setErr != nil {
		return r.setErr
	}
	if r.values == nil {
		r.values = make(map[string]string)
	}
	r.setCalls++
	r.values[name] = value
	return nil
}

func (r *fakeRegistry) DeleteValue(name string) error {
	if r.deleteErr != nil {
		return r.deleteErr
	}
	delete(r.values, name)
	return nil
}
