//go:build windows

package notification

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

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

// desktopToastBodyBudget caps how many runes the folded body spends, rows included.
//
// # Why a character budget and not a row limit
//
// The template this adapter renders (`tmpl/xml.go.tmpl` in the toast library) binds the WHOLE
// folded body -- every row line with it -- into ONE `<text>` element, and that element carries no
// `hint-maxLines`. So Windows is not paginating rows; it is wrapping a single string and clipping
// it at whatever its own default is. The clip point moves with string WIDTH, which is why a run
// naming three short anime shows all three while one naming two long ones already overflows. A
// cap counting rows would bound the wrong variable.
//
// Runes rather than bytes because anime names are not ASCII: "Eureka·Evrika" costs an extra byte
// and no extra width, and a byte-counted budget would silently fold fewer rows for it.
//
// # Why 220
//
// It is a floor taken from real Action Center captures, not a fitted number. The widest body
// observed rendering IN FULL was 195 runes (a 40-rune body plus two 76/77-rune rows), so a
// tighter budget would delete rows Windows was demonstrably willing to show. It sits above that
// with room to spare because erring generous costs nothing: an over-budget line is clipped by
// Windows exactly as it is today, while an under-budget one is information this adapter threw
// away. What the budget actually buys is a BOUNDED body -- buildRunDetailRows emits up to fifty
// rows, and a fifty-row toast handed Windows ~2500 characters to cut wherever it liked.
//
// Nothing load-bearing rides on the exact value. Every count now lives in the body's first line
// (see service_notification_bodies.go), which no budget and no wrap can push off the toast.
const desktopToastBodyBudget = 220

// desktopToastRowSeparator joins a row's name to its detail inside one folded line.
const desktopToastRowSeparator = " -- "

// desktopToastRowEllipsis marks a name this adapter shortened. One rune, so it costs the line
// what it saves.
const desktopToastRowEllipsis = "…"

// desktopToastRowLineLimit is the widest a row line may be before Windows wraps it onto a second
// rendered line, and it is why an anime name gets shortened here.
//
// The budget above decides how many rows are SENT; this decides how much vertical space each one
// costs once it arrives, and they are different questions. Windows wraps the one <text> element
// it was given, so two rows with long names occupy the room three short ones do -- the user's
// captures show exactly that, and it is the reason a run that queued three anime could look like
// a run that queued two.
//
// Fifty is bracketed by those captures rather than guessed: a 50-rune row line
// ("Youjo Senki II -- waiting for this run to reach it") rendered on ONE line, and a 76-rune one
// wrapped onto two. The true wrap point is somewhere between, and it moves with DPI and font, so
// the bound sits on the widest line observed staying on one.
const desktopToastRowLineLimit = 50

// desktopToastRowNameFloor is the shortest a shortened name may get.
//
// The limit above is a preference and this is a hard stop, because they protect different things.
// A row detail is not shortened at all -- it is the sentence saying what happened, and half of it
// is not a smaller truth but a different one -- so a long detail alone can consume the whole line.
// When it does, the name would go to nothing, and a row reading "T… -- 3 episode(s) failed"
// identifies no anime. Past this floor a wrapped line is the better trade.
const desktopToastRowNameFloor = 12

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
// Table C). Each named row contributes one line saying which thing and what happened to it.
//
// A collapsed summary row needs no branch of its own, though it used to have one. It stands in
// for anime it does not name, so it carries no Name -- and desktopToastRowLine already answers a
// nameless row with its detail alone. The `if row.CollapsedCount > 0` that returned row.Detail
// was reproducing that path, not adding one: mutation testing found `> 0` and `> 1` produced
// byte-identical toasts on every input runDetailSummaryRow can emit, which is what a redundant
// branch looks like from the outside.
//
// The fold is bounded by desktopToastBodyBudget, on the same reasoning that bounds the buttons at
// desktopToastActionsLimit: a producer is written once and projected onto three surfaces, and the
// medium with the tightest bound is the one that has to fit it. Neither bound leaves a "+N more"
// marker behind, because neither is where the count belongs -- the producer's first line states
// the totals, and the full record is one press away.
//
// The body itself is never trimmed to make room. It is the only part of the string Windows cannot
// push off the notification, so it spends the budget first and the rows join it with what is left.
func desktopToastBody(n Notification) string {
	if len(n.Rows) == 0 {
		return n.Body
	}

	lines := make([]string, 0, len(n.Rows)+1)
	if n.Body != "" {
		lines = append(lines, n.Body)
	}
	for _, row := range n.Rows {
		line := desktopToastRowLine(n.Body, row)
		if line == "" {
			continue
		}
		// The candidate is measured as the string it would actually become, rather than by
		// accumulating a per-row cost alongside it. A parallel tally is a second model of the
		// same value, and the two drift over exactly the thing the budget is about -- whether
		// the separator counts. Joining is O(rows^2) on at most fifty short lines, which is
		// nothing next to the COM call this body is built for.
		if utf8.RuneCountInString(strings.Join(append(lines, line), lineBreak)) > desktopToastBodyBudget {
			// Stop rather than skip ahead: rows arrive worst-first (buildRunDetailRows spends
			// its allocation on the anime needing attention before the quiet ones), so picking
			// up a shorter row from behind one that did not fit would promote a quiet anime
			// over a failed one.
			break
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, lineBreak)
}

// desktopToastRowLine folds ONE row into a body line, saying only what the body does not.
//
// A single-anime run's body already reads "Download check started for <name>.", and repeating
// that name on the next line is not a cosmetic duplicate on this medium: Windows shows a handful
// of lines and clips the rest, so the repeat pushes the row's actual detail off the notification.
// The first real capture showed exactly that. Where the body already names the row, the line
// carries the detail alone; where it does not -- a fan-out run's body says how many, not which --
// the row still names itself.
//
// The separator is added only when both halves exist. Trimming the outside of "Name -- " leaves
// the separator attached, so a row carrying no detail used to read "Frieren --".
func desktopToastRowLine(body string, row DetailItem) string {
	name := strings.TrimSpace(row.Name)
	detail := strings.TrimSpace(row.Detail)

	if name != "" && strings.Contains(body, name) {
		return detail
	}
	switch {
	case name != "" && detail != "":
		spent := utf8.RuneCountInString(desktopToastRowSeparator) + utf8.RuneCountInString(detail)
		return fitDesktopToastName(name, spent) + desktopToastRowSeparator + detail
	case name != "":
		return fitDesktopToastName(name, 0)
	default:
		return detail
	}
}

// fitDesktopToastName shortens an anime name so its row line stays on one rendered line, given
// the runes the rest of that line already spends.
//
// Only the name is shortened, because it is the only part of the line that can lose its tail and
// stay useful: "Nijuuseiki Den…" is still recognisable to whoever put the anime in their
// catalogue, while half a detail sentence says something other than what happened. The full name
// is intact one press away, on a surface with room to draw it.
//
// max rather than an `if available < floor` branch, for the reason allocateRunDetailRows clamps:
// at exactly the floor both arms of that branch return the same string, so no test could tell the
// comparison from its neighbours. Clamping removes the boundary instead of guarding it.
func fitDesktopToastName(name string, spent int) string {
	available := max(desktopToastRowLineLimit-spent, desktopToastRowNameFloor)
	runes := []rune(name)
	if len(runes) <= available {
		return name
	}
	return string(runes[:available-utf8.RuneCountInString(desktopToastRowEllipsis)]) + desktopToastRowEllipsis
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
