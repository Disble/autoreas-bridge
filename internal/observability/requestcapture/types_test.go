package requestcapture

import "testing"

// TestValidateToolNameAcceptsExactlyFourBareNames asserts the tool-name
// validator accepts only the four bare, transport-neutral tool names.
func TestValidateToolNameAcceptsExactlyFourBareNames(t *testing.T) {
	t.Parallel()

	for _, name := range []string{"resolve_request_context", "search_requests", "get_request_context", "summary_requests"} {
		if err := ValidateToolName(name); err != nil {
			t.Fatalf("expected %q to be accepted, got %v", name, err)
		}
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
