//go:build !windows

// This file is a CLEARLY-LABELED no-op fake that exists ONLY so the
// non-Windows build compiles and non-desktop tests run on Linux/macOS
// (design.md §14.2/§14.4, ADR-NOTIF-3). It MUST NOT be treated as having
// delivered a desktop notification -- Delivered() always reports false,
// mirroring the discipline used by the non-Windows DPAPI crypto fake
// (internal/download/crypto/crypto_other.go, Insecure=true).
package notification

import "context"

// DesktopToastAdapter is the non-Windows no-op fake. It never delivers an
// actual OS notification.
type DesktopToastAdapter struct{}

// NewDesktopToastAdapter builds the non-Windows no-op fake adapter.
func NewDesktopToastAdapter() *DesktopToastAdapter {
	return &DesktopToastAdapter{}
}

// Deliver is a no-op on non-Windows builds. It never errors and never
// delivers a real desktop notification.
func (a *DesktopToastAdapter) Deliver(ctx context.Context, delivery Delivery) error {
	return nil
}

// Delivered always reports false on the non-Windows fake: it MUST NOT
// satisfy any "desktop notification delivered" assertion.
func (a *DesktopToastAdapter) Delivered() bool {
	return false
}

// SetDesktopActivationHandler is a no-op on non-Windows builds: there is no OS toast to press, so
// there is no activation to route. It exists so the composition root wires the same call on every
// platform rather than growing a build-tagged branch of its own.
func SetDesktopActivationHandler(handler func(recordID int64, actionID string)) {}
