package notification

import (
	"strconv"
	"strings"
)

// activationScheme prefixes every argument this package freezes into a desktop toast.
//
// It exists so DecodeActivation can refuse a string it does not own. The activation callback the
// OS invokes is process-global: anything that reaches it arrives from outside this program, and a
// press optimistically parsed into a record id we invented would act on a notification the user
// never saw.
const activationScheme = "autoreas-notification"

// activationSeparator joins the scheme, the record id and the action id.
const activationSeparator = ":"

// EncodeActivation builds the argument a desktop toast freezes into a button, or into its own
// whole-toast press when actionID is empty.
//
// A record id of zero returns the empty string: a delivery nothing persisted has no record to
// address, and an argument pointing at id 0 would be a press aimed at nothing. The adapter reads
// that empty answer as "this toast is not actionable" (ADR-016).
func EncodeActivation(recordID int64, actionID string) string {
	if recordID <= 0 {
		return ""
	}
	return activationScheme + activationSeparator + strconv.FormatInt(recordID, 10) + activationSeparator + actionID
}

// DecodeActivation reads back what EncodeActivation froze, reporting whether the argument is one
// this program owns and can act on.
//
// An empty action id is a valid answer, not a failure: it is what a press on the toast body
// rather than on one of its buttons produces, and it means "open this record" rather than "run
// this verb".
//
// The action id is taken as the whole remainder rather than as the third field, so an id
// containing the separator survives. Stored action ids are uuids today and carry none, but the id
// is a persisted string and a decoder that truncates one would fail silently and rarely.
func DecodeActivation(argument string) (recordID int64, actionID string, ok bool) {
	parts := strings.SplitN(argument, activationSeparator, 3)
	if len(parts) != 3 || parts[0] != activationScheme {
		return 0, "", false
	}

	recordID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || recordID <= 0 {
		return 0, "", false
	}
	return recordID, parts[2], true
}
