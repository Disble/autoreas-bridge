//go:build windows

package autostart

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows/registry"
)

// NewSystemReconciler creates the production current-user Windows Run adapter.
func NewSystemReconciler() *Reconciler {
	return NewReconciler(windowsRegistry{}, os.Executable)
}

type windowsRegistry struct{}

func (windowsRegistry) GetValue(name string) (string, bool, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, RunKeyPath, registry.QUERY_VALUE)
	if errors.Is(err, registry.ErrNotExist) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("open Run key: %w", err)
	}
	defer func() { _ = key.Close() }()

	value, _, err := key.GetStringValue(name)
	if errors.Is(err, registry.ErrNotExist) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read Run value: %w", err)
	}
	return value, true, nil
}

func (windowsRegistry) SetValue(name, value string) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, RunKeyPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("open Run key: %w", err)
	}
	defer func() { _ = key.Close() }()
	return key.SetStringValue(name, value)
}

func (windowsRegistry) DeleteValue(name string) error {
	key, err := registry.OpenKey(registry.CURRENT_USER, RunKeyPath, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("open Run key: %w", err)
	}
	defer func() { _ = key.Close() }()
	return key.DeleteValue(name)
}
