//go:build windows

package notification

import (
	"context"
	"strings"
	"testing"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
)

// deliverToastXML captures the toast XML one Deliver pushes to the OS.
//
// Asserting on the XML rather than on the Go value is the point: it is the only artefact Windows
// actually reads, so a field set but never rendered would pass a value-level assertion and show
// the user nothing.
//
// No test in this file calls t.Parallel(). The adapter's seams are package-level vars, so parallel
// tests would swap them out from under each other and read whichever push happened to win.
func deliverToastXML(t *testing.T, delivery Delivery) string {
	t.Helper()

	originalSetAppData := setDesktopToastAppData
	originalPush := pushDesktopToast
	t.Cleanup(func() {
		setDesktopToastAppData = originalSetAppData
		pushDesktopToast = originalPush
	})

	var pushed string
	setDesktopToastAppData = func(toast.AppData) error { return nil }
	pushDesktopToast = func(_ string, xml string) error {
		pushed = xml
		return nil
	}

	if err := NewDesktopToastAdapter().Deliver(context.Background(), delivery); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	return pushed
}

// runCompletedDelivery is one persisted record carrying a row, a whole-notification verb, and a
// row verb -- the smallest shape that exercises every projection rule at once.
func runCompletedDelivery() Delivery {
	return Delivery{
		Notification: Notification{
			Title: "Download run completed",
			Body:  "1 episode(s) downloaded.",
			Rows: []DetailItem{
				{RefType: "anime", RefID: "a-1", Name: "Frieren", Status: "downloaded", Detail: "Episode 19 -- ready to watch"},
			},
			Actions: []ActionSpec{
				{Label: "Open Downloads", Intent: "navigation.open"},
				{Label: "Watch", Intent: "navigation.open", RowRef: "a-1"},
			},
		},
		RecordID:  42,
		ActionIDs: []string{"act-1", "act-2"},
	}
}

// TestWindowsToastOffersItsWholeNotificationVerbs is the gap this closes: the adapter set four
// fields and ignored the actions entirely, so a Windows notification was a sentence with no way
// to act on it (ADR-016).
func TestWindowsToastOffersItsWholeNotificationVerbs(t *testing.T) {
	xml := deliverToastXML(t, runCompletedDelivery())

	if !strings.Contains(xml, "Open Downloads") {
		t.Fatalf("toast XML carries no whole-notification button:\n%s", xml)
	}
	if !strings.Contains(xml, "autoreas-notification:42:act-1") {
		t.Fatalf("the button froze no argument addressing its token:\n%s", xml)
	}
}

// TestWindowsToastLeavesRowVerbsToTheOtherSurfaces: the medium has no row to bind one to, and a
// button reading "Watch" with no row beside it names no anime.
func TestWindowsToastLeavesRowVerbsToTheOtherSurfaces(t *testing.T) {
	xml := deliverToastXML(t, runCompletedDelivery())

	if strings.Contains(xml, "act-2") {
		t.Fatalf("a row verb reached the Windows toast, which has no row to bind it to:\n%s", xml)
	}
}

// TestWindowsToastFoldsItsRowsIntoTheBody: Windows has images, buttons and inputs but no
// repeatable row. Collapsing is a translation; dropping would not be.
func TestWindowsToastFoldsItsRowsIntoTheBody(t *testing.T) {
	xml := deliverToastXML(t, runCompletedDelivery())

	if !strings.Contains(xml, "Frieren") {
		t.Fatalf("the toast names no anime, so it says a run completed and not which one:\n%s", xml)
	}
	if !strings.Contains(xml, "Episode 19 -- ready to watch") {
		t.Fatalf("the row's detail line did not reach the body:\n%s", xml)
	}
}

// TestWindowsToastAddressesItsRecordOnAWholeToastPress covers the click on the body rather than
// on a button: there is a record to open and no verb to run.
func TestWindowsToastAddressesItsRecordOnAWholeToastPress(t *testing.T) {
	xml := deliverToastXML(t, runCompletedDelivery())

	if !strings.Contains(xml, "autoreas-notification:42:") {
		t.Fatalf("the toast itself addresses no record:\n%s", xml)
	}
}

// TestWindowsToastOffersNothingForAnUnpersistedDelivery: a button that resolves to no record is
// worse than no button -- it refuses on press and looks exactly like the one that was missing.
func TestWindowsToastOffersNothingForAnUnpersistedDelivery(t *testing.T) {
	delivery := runCompletedDelivery()
	delivery.RecordID = 0
	delivery.ActionIDs = nil

	xml := deliverToastXML(t, delivery)

	if strings.Contains(xml, "Open Downloads") {
		t.Fatalf("an unpersisted delivery grew a button addressing nothing:\n%s", xml)
	}
	if !strings.Contains(xml, "Download run completed") {
		t.Fatalf("the notification itself stopped being delivered:\n%s", xml)
	}
}

// TestWindowsToastBoundsItsButtonsToWhatWindowsAccepts: Windows refuses more than five, so the
// bound belongs to the adapter. A producer is written once and projected onto three surfaces; the
// tightest medium is the one that has to fit.
func TestWindowsToastBoundsItsButtonsToWhatWindowsAccepts(t *testing.T) {
	delivery := Delivery{Notification: Notification{Title: "Many verbs"}, RecordID: 7}
	for index := range 8 {
		delivery.Notification.Actions = append(delivery.Notification.Actions, ActionSpec{Label: "Verb"})
		delivery.ActionIDs = append(delivery.ActionIDs, "act-"+string(rune('a'+index)))
	}

	xml := deliverToastXML(t, delivery)

	if strings.Count(xml, "autoreas-notification:7:act-") != 5 {
		t.Fatalf("toast carries %d buttons, want the 5 Windows accepts:\n%s", strings.Count(xml, "autoreas-notification:7:act-"), xml)
	}
}

// TestWindowsToastKeepsAPlainNotificationUnchanged guards the fold from rewriting a notification
// that names nothing: most producers attach no rows at all.
func TestWindowsToastKeepsAPlainNotificationUnchanged(t *testing.T) {
	xml := deliverToastXML(t, Delivery{Notification: Notification{Title: "Device paired", Body: "A mobile device paired."}})

	if !strings.Contains(xml, "A mobile device paired.") {
		t.Fatalf("a row-less notification lost its body:\n%s", xml)
	}
}
