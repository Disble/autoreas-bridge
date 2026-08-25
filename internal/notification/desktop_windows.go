//go:build windows

package notification

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
	"git.sr.ht/~jackmordaunt/go-toast/v2/tmpl"
	"git.sr.ht/~jackmordaunt/go-toast/v2/wintoast"
)

// desktopToastAppID is shown in the Windows Action Center and beneath the
// toast message. Kept generic/app-level rather than per-feature, matching
// the shared/generic nature of this notifier (ADR-NOTIF-1).
const desktopToastAppID = "Autoreas Bridge"

// desktopToastActionsLimit caps how many buttons one Windows toast carries. Windows itself
// refuses more than five, so the bound belongs to the ADAPTER rather than to the producer: a
// notification is written once and projected onto three surfaces, and the one with the tightest
// medium is the one that has to fit (ADR-016).
const desktopToastActionsLimit = 5

// lineBreak separates the folded row lines inside a Windows toast body.
const lineBreak = "\n"

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
func (a *DesktopToastAdapter) Deliver(ctx context.Context, delivery Delivery) error {
	if a == nil {
		return nil
	}
	n := delivery.Notification

	if err := setDesktopToastAppData(toast.AppData{AppID: desktopToastAppID}); err != nil {
		a.delivered = false
		return fmt.Errorf("desktop toast app data: %w", err)
	}

	notification := toast.Notification{
		AppID:               desktopToastAppID,
		Title:               n.Title,
		Body:                desktopToastBody(n),
		Audio:               toast.Default,
		Duration:            toast.Short,
		ActivationType:      toast.Foreground,
		ActivationArguments: EncodeActivation(delivery.RecordID, ""),
		Actions:             desktopToastActions(delivery),
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

// desktopToastBody folds the notification's rows into its body.
//
// Windows has images, buttons and inputs but no repeatable row, so collapsing is the honest
// translation of a row list here -- dropping it would not be (docs/notification-cta-policy.md,
// Table C). Each named row contributes one line saying which thing and what happened to it; a
// collapsed row contributes its own summary line, since it already stands in for anime it does
// not name.
func desktopToastBody(n Notification) string {
	if len(n.Rows) == 0 {
		return n.Body
	}

	lines := make([]string, 0, len(n.Rows)+1)
	if n.Body != "" {
		lines = append(lines, n.Body)
	}
	for _, row := range n.Rows {
		if row.CollapsedCount > 0 {
			lines = append(lines, row.Detail)
			continue
		}
		lines = append(lines, strings.TrimSpace(row.Name+" -- "+row.Detail))
	}
	return strings.Join(lines, lineBreak)
}

// desktopToastActions projects the notification's whole-notification verbs onto Windows buttons.
//
// Row verbs are left out because the medium has no row to bind one to, and a button labelled
// "Watch" with no row beside it would name no anime. Every button freezes the pair that addresses
// its persisted token, which the process-global activation callback reads back and hands to the
// same executor the detail pane presses through.
//
// A delivery nothing persisted yields no buttons at all: EncodeActivation answers empty for it,
// and a button that resolves to nothing is worse than no button.
func desktopToastActions(delivery Delivery) []toast.Action {
	if delivery.RecordID <= 0 {
		return nil
	}

	actions := make([]toast.Action, 0, desktopToastActionsLimit)
	for index, spec := range delivery.Notification.Actions {
		if spec.RowRef != "" {
			continue
		}
		actionID := delivery.ActionID(index)
		if actionID == "" {
			continue
		}
		if len(actions) == desktopToastActionsLimit {
			return actions
		}
		actions = append(actions, toast.Action{
			Type:      toast.Foreground,
			Content:   spec.Label,
			Arguments: EncodeActivation(delivery.RecordID, actionID),
		})
	}
	return actions
}

// SetDesktopActivationHandler registers the process-global callback Windows invokes when the user
// presses a desktop toast or one of its buttons.
//
// It is registered ONCE at startup rather than per notification: the library exposes a single
// global callback, and the argument the toast froze is the only thing that says which press
// happened. An argument this program does not own is refused outright -- the callback is reachable
// from outside the process, and a press optimistically parsed into a record id we invented would
// act on a notification the user never saw.
//
// The handler is invoked only for arguments that decode, so its caller receives a record id it can
// trust and an action id that is empty when the press was on the toast body rather than a button.
//
// Note this is inert while the library's PowerShell fallback is in effect. Deliver calls
// wintoast.Push directly to avoid that fallback, which makes that call load-bearing rather than
// stylistic (ADR-016).
func SetDesktopActivationHandler(handler func(recordID int64, actionID string)) {
	if handler == nil {
		return
	}
	toast.SetActivationCallback(func(arguments string, _ []toast.UserData) {
		recordID, actionID, ok := DecodeActivation(arguments)
		if !ok {
			return
		}
		handler(recordID, actionID)
	})
}
