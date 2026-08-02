// Package autostart reconciles the current user's Windows login-launch entry.
package autostart

import "fmt"

const (
	// RunKeyPath is the current-user Windows Run registry key.
	RunKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
	// RunValueName identifies the only registry value this package owns.
	RunValueName = "Autoreas Bridge"
)

// Registry is the narrow Windows registry boundary used by the reconciler.
type Registry interface {
	GetValue(name string) (value string, exists bool, err error)
	SetValue(name, value string) error
	DeleteValue(name string) error
}

// Reconciler brings the Bridge-owned Run value into line with the user setting.
type Reconciler struct {
	registry   Registry
	executable func() (string, error)
}

// NewReconciler creates a login-launch reconciler with an executable-path seam.
func NewReconciler(registry Registry, executable func() (string, error)) *Reconciler {
	return &Reconciler{registry: registry, executable: executable}
}

// Reconcile writes the current executable command when enabled and removes only
// the Bridge-owned value when disabled.
func (r *Reconciler) Reconcile(enabled bool) error {
	current, exists, err := r.registry.GetValue(RunValueName)
	if err != nil {
		return fmt.Errorf("read auto-start registry value: %w", err)
	}
	if !enabled {
		if !exists {
			return nil
		}
		if err := r.registry.DeleteValue(RunValueName); err != nil {
			return fmt.Errorf("remove auto-start registry value: %w", err)
		}
		return nil
	}

	path, err := r.executable()
	if err != nil {
		return fmt.Errorf("resolve executable path: %w", err)
	}
	command := `"` + path + `"`
	if exists && current == command {
		return nil
	}
	if err := r.registry.SetValue(RunValueName, command); err != nil {
		return fmt.Errorf("write auto-start registry value: %w", err)
	}
	return nil
}
