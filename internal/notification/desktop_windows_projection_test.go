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

// TestWindowsToastDoesNotSayTheSameNameTwice is what the first real Windows capture showed. A
// single-anime run's body already reads "Download check started for <name>.", and folding its row
// in repeated that name verbatim on the next line -- which on a medium that shows four lines and
// then clips is not a cosmetic repeat, it is the detail being pushed off the notification.
//
// The row still contributes what the body does NOT carry: its detail line.
func TestWindowsToastDoesNotSayTheSameNameTwice(t *testing.T) {
	xml := deliverToastXML(t, Delivery{Notification: Notification{
		Title: "Anime download started",
		Body:  "Download check started for Honzuki no Gekokujou.",
		Rows: []DetailItem{
			{RefType: "anime", RefID: "a-1", Name: "Honzuki no Gekokujou", Status: "queued", Detail: "waiting for this run to reach it"},
		},
	}})

	if strings.Count(xml, "Honzuki no Gekokujou") != 1 {
		t.Fatalf("the anime is named %d times, want once:\n%s", strings.Count(xml, "Honzuki no Gekokujou"), xml)
	}
	if !strings.Contains(xml, "waiting for this run to reach it") {
		t.Fatalf("dropping the repeated name took the row's detail with it:\n%s", xml)
	}
}

// TestWindowsToastStillNamesARowTheBodyDoesNotMention: a fan-out run's body says how many, not
// which, so every row still has to name itself.
func TestWindowsToastStillNamesARowTheBodyDoesNotMention(t *testing.T) {
	xml := deliverToastXML(t, Delivery{Notification: Notification{
		Title: "Download run started",
		Body:  "Download check started (scheduled).",
		Rows: []DetailItem{
			{RefType: "anime", RefID: "a-1", Name: "Frieren", Status: "queued", Detail: "waiting for this run to reach it"},
		},
	}})

	if !strings.Contains(xml, "Frieren") {
		t.Fatalf("a row the body never mentioned lost its name:\n%s", xml)
	}
}

// TestWindowsToastLeavesNoDanglingSeparator: a row carrying no detail line produced "Name --",
// because trimming the outside of "Name -- " leaves the separator attached.
func TestWindowsToastLeavesNoDanglingSeparator(t *testing.T) {
	xml := deliverToastXML(t, Delivery{Notification: Notification{
		Title: "Download run started",
		Body:  "Download check started (scheduled).",
		Rows:  []DetailItem{{RefType: "anime", RefID: "a-1", Name: "Frieren", Status: "queued"}},
	}})

	if strings.Contains(xml, "Frieren --") {
		t.Fatalf("a detail-less row kept its separator:\n%s", xml)
	}
	if !strings.Contains(xml, "Frieren") {
		t.Fatalf("the row lost its name along with the separator:\n%s", xml)
	}
}
