package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"autoreas-bridge/internal/observability/telemetry"
)

// TestSyncDiagnosticsRefusalsCarryTheirClassifyingCode pins the invariant that makes
// the refusal vocabulary extensible: EVERY refusal this endpoint emits carries a `code`
// from the closed set, so a client branches on one field instead of on a status list it
// has to keep in sync with the bridge. A new refusal class is a new member here, never a
// new status code and never a new per-case key -- which is why one of these rows is the
// RECOVERABLE case and the rest are not, and why nothing in the table is a boolean.
//
// The expected codes are LITERAL strings, deliberately not the RefusalCode constants.
// Asserting `response.code == RefusalKindNotServed` while production also emits that
// constant moves both sides together and passes under any change to the constant's
// value -- the same circularity that made an earlier payload assertion prove nothing.
// A literal makes the wire value itself the thing under test.
func TestSyncDiagnosticsRefusalsCarryTheirClassifyingCode(t *testing.T) {
	t.Parallel()

	cases := []struct {
		label string
		body  string
		code  string
		field string // empty means the refusal must name no field at all
	}{
		{
			label: "a well-formed kind this build does not serve is RECOVERABLE",
			body:  bodyWithKindValue(validDiagnosticsBody(), `"never_registered_kind"`),
			code:  "kind_not_served",
			field: "kind",
		},
		{
			label: "a null discriminator is permanent",
			body:  bodyWithKindValue(validDiagnosticsBody(), `null`),
			code:  "kind_malformed",
			field: "kind",
		},
		{
			label: "a discriminator that is not a string is permanent",
			body:  bodyWithKindValue(validDiagnosticsBody(), `123`),
			code:  "kind_malformed",
			field: "kind",
		},
		{
			label: "a body that is not an object names no field",
			body:  `null`,
			code:  "body_unreadable",
			field: "",
		},
		{
			label: "an off-vocabulary value names the field that carried it",
			body:  strings.Replace(validDiagnosticsBody(), `"trigger_source":"foreground_service"`, `"trigger_source":"nonsense"`, 1),
			code:  "field_rejected",
			field: "trigger_source",
		},
		{
			label: "an empty object is a cycle report missing a required key",
			body:  `{}`,
			code:  "field_rejected",
			field: "degraded",
		},
	}

	for _, tc := range cases {
		stubs := &telemetryHandlerStubs{authOK: true, deviceID: "dev-1", outcome: telemetry.Stored}
		res := postDiagnostics(t, newDiagnosticsHandler(stubs, nil), tc.body)

		if res.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", tc.label, res.Code)
		}
		var body map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s: response %q is not JSON: %v", tc.label, res.Body.String(), err)
		}
		if body["code"] != tc.code {
			t.Fatalf("%s: code = %v, want %q (response %q)", tc.label, body["code"], tc.code, res.Body.String())
		}

		gotField, hasField := body["field"].(string)
		if !hasField {
			if tc.field != "" {
				t.Fatalf("%s: field missing, want %q (response %q)", tc.label, tc.field, res.Body.String())
			}
		} else if gotField != tc.field {
			t.Fatalf("%s: field = %q, want %q (response %q)", tc.label, gotField, tc.field, res.Body.String())
		}

		if stubs.ingestCalls != 0 {
			t.Fatalf("%s: ingest must not be called for a refusal", tc.label)
		}
	}
}
