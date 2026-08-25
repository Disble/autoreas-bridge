package notification

import "testing"

// TestActivationArgumentsRoundTrip is the whole contract: whatever the toast froze into a button
// is what the callback reads back, because the two are the only halves of a press that cross the
// OS boundary.
func TestActivationArgumentsRoundTrip(t *testing.T) {
	t.Parallel()

	encoded := EncodeActivation(42, "3f2b8c1e-0000-4a1b-9c2d-000000000001")

	recordID, actionID, ok := DecodeActivation(encoded)

	if !ok {
		t.Fatalf("DecodeActivation(%q) reported failure", encoded)
	}
	if recordID != 42 {
		t.Fatalf("record id = %d, want 42", recordID)
	}
	if actionID != "3f2b8c1e-0000-4a1b-9c2d-000000000001" {
		t.Fatalf("action id = %q, want the one that was encoded", actionID)
	}
}

// TestActivationArgumentsAddressTheRecordAloneWhenNoActionWasPressed covers the whole-toast press:
// the body was clicked rather than a button, so there is a record to open and no verb to run.
func TestActivationArgumentsAddressTheRecordAloneWhenNoActionWasPressed(t *testing.T) {
	t.Parallel()

	recordID, actionID, ok := DecodeActivation(EncodeActivation(42, ""))

	if !ok || recordID != 42 || actionID != "" {
		t.Fatalf("decoded (%d, %q, %v), want (42, \"\", true)", recordID, actionID, ok)
	}
}

// TestActivationArgumentsRefuseWhatTheyDoNotOwn is the security half. This string arrives from the
// OS, so anything that is not ours must be refused rather than parsed optimistically -- a press
// resolving to a record id we invented would act on a notification the user never saw.
func TestActivationArgumentsRefuseWhatTheyDoNotOwn(t *testing.T) {
	t.Parallel()

	for name, argument := range map[string]string{
		"empty":            "",
		"foreign scheme":   "someoneelse:42:act-1",
		"no record":        "autoreas-notification::act-1",
		"record not a num": "autoreas-notification:abc:act-1",
		"too few parts":    "autoreas-notification:42",
		"negative record":  "autoreas-notification:-1:act-1",
		"zero record":      "autoreas-notification:0:act-1",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			if _, _, ok := DecodeActivation(argument); ok {
				t.Fatalf("DecodeActivation(%q) accepted an argument it does not own", argument)
			}
		})
	}
}

// TestActivationArgumentsKeepAnActionIDContainingTheSeparator: uuid ids carry no colon today, but
// the id is a stored string and splitting on every separator would silently truncate one that did.
func TestActivationArgumentsKeepAnActionIDContainingTheSeparator(t *testing.T) {
	t.Parallel()

	_, actionID, ok := DecodeActivation(EncodeActivation(7, "act:with:colons"))

	if !ok || actionID != "act:with:colons" {
		t.Fatalf("decoded action id = %q (ok=%v), want it intact", actionID, ok)
	}
}

// TestActivationArgumentsAreEmptyForAnUnpersistedRecord: a delivery nothing persisted has no
// record to address, so the toast must freeze nothing rather than an argument pointing at id 0.
func TestActivationArgumentsAreEmptyForAnUnpersistedRecord(t *testing.T) {
	t.Parallel()

	if got := EncodeActivation(0, "act-1"); got != "" {
		t.Fatalf("EncodeActivation(0, ...) = %q, want empty", got)
	}
}
