package autostart

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestReconcilerReplacesThrowawayRunValueWithInstalledCommand(t *testing.T) {
	t.Parallel()

	poisoned := `"` + filepath.Join(os.TempDir(), "go-build123", "b001", "autoreas-bridge.test.exe") + `"`
	registry := &fakeRegistry{values: map[string]string{RunValueName: poisoned}}
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
