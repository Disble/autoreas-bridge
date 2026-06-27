//go:build windows

// This file is the REAL Windows desktop-toast implementation (design.md
// §14.2/§14.4, ADR-NOTIF-3). It uses git.sr.ht/~jackmordaunt/go-toast/v2, a
// vetted, pure-Go Windows toast library that pushes notifications via the
// native WinRT COM API (wintoast.pushCOM).
//
// IMPORTANT: this adapter deliberately calls the low-level wintoast.Push
// directly with ZERO options, instead of the library's higher-level
// toast.Notification.Push() convenience method. toast.Notification.Push()
// internally calls wintoast.Push(appID, xml, wintoast.PowershellFallback),
// which WOULD shell out to PowerShell if the COM call fails. Calling
// wintoast.Push with no options guarantees this adapter NEVER invokes
// PowerShell or any external shell process under any circumstance, matching
// the notifications spec's "Desktop notification on Windows" scenario
// verbatim -- the same discipline used for the DPAPI crypto seam
// (internal/download/crypto).
package notification

import (
	"bytes"
	"context"
	"fmt"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
	"git.sr.ht/~jackmordaunt/go-toast/v2/tmpl"
	"git.sr.ht/~jackmordaunt/go-toast/v2/wintoast"
)

// desktopToastAppID is shown in the Windows Action Center and beneath the
// toast message. Kept generic/app-level rather than per-feature, matching
// the shared/generic nature of this notifier (ADR-NOTIF-1).
const desktopToastAppID = "Autoreas Bridge"

var (
	setDesktopToastAppData = toast.SetAppData
	pushDesktopToast       = func(appID string, xml string) error { return wintoast.Push(appID, xml) }
)

// DesktopToastAdapter delivers a proper native Windows desktop notification
// via the COM API (no PowerShell). Delivered() reports whether the most
// recent Deliver call successfully reached the OS toast pipeline; it exists
// so callers/tests can distinguish a real delivery from the non-Windows
// no-op fake's permanently-false Delivered().
type DesktopToastAdapter struct {
	delivered bool
}

// NewDesktopToastAdapter builds the real Windows desktop-toast adapter.
func NewDesktopToastAdapter() *DesktopToastAdapter {
	return &DesktopToastAdapter{}
}

// Deliver pushes n as a native Windows toast notification exclusively via
// the WinRT COM API. It builds the same toast XML the library's
// Notification.Push() would build, then calls wintoast.Push with no
// options -- so a COM failure surfaces as an error rather than ever
// shelling out to PowerShell.
func (a *DesktopToastAdapter) Deliver(ctx context.Context, n Notification) error {
	if a == nil {
		return nil
	}

	if err := setDesktopToastAppData(toast.AppData{AppID: desktopToastAppID}); err != nil {
		a.delivered = false
		return fmt.Errorf("desktop toast app data: %w", err)
	}

	notification := toast.Notification{
		AppID:    desktopToastAppID,
		Title:    n.Title,
		Body:     n.Body,
		Audio:    toast.Default,
		Duration: toast.Short,
	}

	var xmlBuf bytes.Buffer
	if err := tmpl.XMLTemplate.Execute(&xmlBuf, &notification); err != nil {
		a.delivered = false
		return fmt.Errorf("desktop toast build xml: %w", err)
	}

	if err := pushDesktopToast(notification.AppID, xmlBuf.String()); err != nil {
		a.delivered = false
		return fmt.Errorf("desktop toast push: %w", err)
	}

	a.delivered = true
	return nil
}

// Delivered reports whether the most recent Deliver call reached the OS
// toast pipeline successfully.
func (a *DesktopToastAdapter) Delivered() bool {
	if a == nil {
		return false
	}
	return a.delivered
}
