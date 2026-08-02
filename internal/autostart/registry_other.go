//go:build !windows

package autostart

import (
	"errors"
	"os"
)

var errWindowsOnly = errors.New("Windows auto-start is unavailable on this platform")

// NewSystemReconciler returns an adapter that reports the unavailable platform.
func NewSystemReconciler() *Reconciler {
	return NewReconciler(unsupportedRegistry{}, os.Executable)
}

type unsupportedRegistry struct{}

func (unsupportedRegistry) GetValue(string) (string, bool, error) { return "", false, errWindowsOnly }
func (unsupportedRegistry) SetValue(string, string) error         { return errWindowsOnly }
func (unsupportedRegistry) DeleteValue(string) error              { return errWindowsOnly }
