package notification

import "testing"

// TestNotificationZeroValueRowsAndActionsAreNil pins the additive nature of the Rows/Actions
// fields (design.md Task-Planning Note B): a Notification built by any of the pre-existing
// producers, which never set them, MUST still zero-value to nil rather than an empty slice --
// every adapter that inspects "did the producer attach anything" must be able to test for nil.
func TestNotificationZeroValueRowsAndActionsAreNil(t *testing.T) {
	t.Parallel()

	var n Notification

	if n.Rows != nil {
		t.Fatalf("zero-value Notification.Rows = %#v, want nil", n.Rows)
	}
	if n.Actions != nil {
		t.Fatalf("zero-value Notification.Actions = %#v, want nil", n.Actions)
	}
}
