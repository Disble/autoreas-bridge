package requestcapture

import "testing"

// TestValidateToolNameAcceptsExactlySevenBareNames asserts the tool-name
// validator accepts exactly the seven bare, transport-neutral tool names:
// the four request-capture tools plus the three runtime-event tools added by
// this change.
func TestValidateToolNameAcceptsExactlySevenBareNames(t *testing.T) {
	t.Parallel()

	for _, name := range []string{
		"resolve_request_context", "search_requests", "get_request_context", "summary_requests",
		"search_events", "get_correlation_timeline", "summary_events",
	} {
		if err := ValidateToolName(name); err != nil {
			t.Fatalf("expected %q to be accepted, got %v", name, err)
		}
	}
}

// TestValidateToolNameRejectsAliasVariants asserts no alias name is accepted
// for any tool, existing or new -- each capability is exposed under exactly
// one name.
func TestValidateToolNameRejectsAliasVariants(t *testing.T) {
	t.Parallel()

	for _, name := range []string{
		"search_runtime_events", "get_events", "event_search", "correlation_timeline",
		"get_timeline", "summarize_events", "events_summary",
	} {
		err := ValidateToolName(name)
		assertRequestCaptureErrorCode(t, err, "unsupported")
	}
}

// TestValidateToolNameRejectsPreviouslyRegisteredNames asserts the validator
// rejects every previously-registered mobile-prefixed tool name as
// unsupported, with no silent aliasing to a current name.
func TestValidateToolNameRejectsPreviouslyRegisteredNames(t *testing.T) {
	t.Parallel()

	for _, name := range []string{"search_mobile_requests", "get_mobile_request_context", "resolve_mobile_request_context", "summary_mobile_requests"} {
		err := ValidateToolName(name)
		assertRequestCaptureErrorCode(t, err, "unsupported")
	}
}
