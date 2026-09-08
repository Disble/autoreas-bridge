package syncdiag

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

// validReportTemplate is a complete, otherwise-valid wire envelope with one
// placeholder per field this test file exercises. Tests override exactly
// the field under test and leave every other placeholder at its default, so
// a rejection can only be attributed to the field the test names.
const validReportTemplate = `{
  "cycle_id": "11111111-1111-1111-1111-111111111111",
  "degraded": {{DEGRADED}},
  "trigger_source": "{{TRIGGER_SOURCE}}",
  "app_state": "{{APP_STATE}}",
  "previous_cycle": {
    "cycle_id": "22222222-2222-2222-2222-222222222222",
    "trigger_source": "{{PREV_TRIGGER_SOURCE}}",
    "outcome": "{{OUTCOME}}",
    "last_stage": "{{LAST_STAGE}}",
    "started_at": 1000,
    "elapsed_ms": 500,
    "error_name": "{{ERROR_NAME}}",
    "native_errcode_byte": 5,
    "error_stage": "{{ERROR_STAGE}}",
    "error_cause": "{{ERROR_CAUSE}}",
    "error_fingerprint": "3f2a91b0"
  },
  "counters": {
    "consecutive_unclosed_cycles": 0,
    "pending_ops_count": 0,
    "cursor": 42
  },
  "recent_events": [
    {"source": "{{EVENT_SOURCE}}", "event": "{{EVENT_TYPE}}", "cause": "timeout", "first_at": 1, "last_at": 2, "count": 1}
  ]
}`

// buildReportJSON renders validReportTemplate with defaults, overriding
// exactly the placeholders named in overrides.
func buildReportJSON(overrides map[string]string) string {
	defaults := map[string]string{
		"DEGRADED":            "null",
		"TRIGGER_SOURCE":      "foreground_service",
		"APP_STATE":           "background",
		"PREV_TRIGGER_SOURCE": "manual",
		"OUTCOME":             "completed",
		"LAST_STAGE":          "closed",
		"ERROR_NAME":          "unknown",
		"ERROR_STAGE":         "unknown",
		"ERROR_CAUSE":         "unknown",
		"EVENT_SOURCE":        "sync_cycle",
		"EVENT_TYPE":          "ws_opened",
	}
	for k, v := range overrides {
		defaults[k] = v
	}
	body := validReportTemplate
	for k, v := range defaults {
		body = strings.ReplaceAll(body, "{{"+k+"}}", v)
	}
	return body
}

// decodeReport unmarshals body into a WireReport, failing the test on a
// decode error rather than letting it surface as a Validate failure.
func decodeReport(t *testing.T, body string) WireReport {
	t.Helper()
	var wire WireReport
	if err := json.Unmarshal([]byte(body), &wire); err != nil {
		t.Fatalf("unmarshal report: %v", err)
	}
	return wire
}

// requireFieldError asserts err is a *FieldError naming wantField.
func requireFieldError(t *testing.T, err error, wantField string) {
	t.Helper()
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) {
		t.Fatalf("expected *FieldError, got %T: %v", err, err)
	}
	if fieldErr.Field != wantField {
		t.Errorf("field = %q, want %q", fieldErr.Field, wantField)
	}
}

func TestValidateRejectsUnknownField(t *testing.T) {
	// previous_cycle is captured as json.RawMessage at the top level, so the
	// outer decode never inspects its interior -- an unknown key nested
	// inside it can only be caught by Validate's own strict decode of that
	// raw message.
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": {"outcome": "completed", "unexpected_field": "x"},
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	_, err := Validate(wire)
	if err == nil {
		t.Fatal("expected rejection for unknown field nested inside previous_cycle, got nil")
	}
	requireFieldError(t, err, "previous_cycle")
}

func TestValidateRejectsOffVocabularyValue(t *testing.T) {
	cases := []struct {
		name      string
		override  map[string]string
		wantField string
	}{
		{"top_level_trigger_source", map[string]string{"TRIGGER_SOURCE": "not_a_real_source"}, "trigger_source"},
		{"previous_trigger_source", map[string]string{"PREV_TRIGGER_SOURCE": "not_a_real_source"}, "previous_cycle.trigger_source"},
		{"app_state", map[string]string{"APP_STATE": "sideways"}, "app_state"},
		{"outcome", map[string]string{"OUTCOME": "sideways"}, "previous_cycle.outcome"},
		{"last_stage", map[string]string{"LAST_STAGE": "sideways"}, "previous_cycle.last_stage"},
		{"error_name", map[string]string{"ERROR_NAME": "SidewaysError"}, "previous_cycle.error_name"},
		{"error_stage", map[string]string{"ERROR_STAGE": "sideways"}, "previous_cycle.error_stage"},
		{"error_cause", map[string]string{"ERROR_CAUSE": "sideways"}, "previous_cycle.error_cause"},
		{"recent_event_source", map[string]string{"EVENT_SOURCE": "sideways"}, "recent_events.source"},
		{"recent_event_type", map[string]string{"EVENT_TYPE": "sideways"}, "recent_events.event"},
		{"degraded", map[string]string{"DEGRADED": `"sideways"`}, "degraded"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			wire := decodeReport(t, buildReportJSON(tc.override))
			_, err := Validate(wire)
			if err == nil {
				t.Fatalf("expected rejection for off-vocabulary %s, got nil", tc.name)
			}
			requireFieldError(t, err, tc.wantField)
		})
	}
}

func TestValidateRejectsTopLevelTriggerSourceLocalMutation(t *testing.T) {
	wire := decodeReport(t, buildReportJSON(map[string]string{"TRIGGER_SOURCE": "local_mutation"}))
	_, err := Validate(wire)
	if err == nil {
		t.Fatal("expected rejection for top-level trigger_source=local_mutation, got nil")
	}
	requireFieldError(t, err, "trigger_source")
}

func TestValidateAcceptsPreviousTriggerSourceLocalMutation(t *testing.T) {
	wire := decodeReport(t, buildReportJSON(map[string]string{"PREV_TRIGGER_SOURCE": "local_mutation"}))
	record, err := Validate(wire)
	if err != nil {
		t.Fatalf("expected acceptance for previous_cycle.trigger_source=local_mutation, got error: %v", err)
	}
	if record.PreviousCycle == nil || record.PreviousCycle.TriggerSource == nil || *record.PreviousCycle.TriggerSource != "local_mutation" {
		t.Errorf("previous cycle trigger source not preserved: %+v", record.PreviousCycle)
	}
}

func TestValidateAcceptsDigitLeadingErrorFingerprint(t *testing.T) {
	wire := decodeReport(t, buildReportJSON(nil))
	record, err := Validate(wire)
	if err != nil {
		t.Fatalf("expected acceptance for digit-leading error_fingerprint, got error: %v", err)
	}
	if record.PreviousCycle == nil || record.PreviousCycle.ErrorFingerprint == nil || *record.PreviousCycle.ErrorFingerprint != "3f2a91b0" {
		t.Errorf("fingerprint not preserved: %+v", record.PreviousCycle)
	}
}

func TestValidateRejectsMissingPreviousCycleKey(t *testing.T) {
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	_, err := Validate(wire)
	if err == nil {
		t.Fatal("expected rejection for missing previous_cycle key, got nil")
	}
	requireFieldError(t, err, "previous_cycle")
}

func TestValidateAcceptsExplicitNullPreviousCycle(t *testing.T) {
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": null,
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	record, err := Validate(wire)
	if err != nil {
		t.Fatalf("expected acceptance for explicit null previous_cycle, got error: %v", err)
	}
	if record.PreviousCycle != nil {
		t.Errorf("expected nil PreviousCycle, got %+v", record.PreviousCycle)
	}
}

func TestValidateAcceptsPreviousCycleWithOnlyOutcome(t *testing.T) {
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": {"outcome": "never_closed"},
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	record, err := Validate(wire)
	if err != nil {
		t.Fatalf("expected acceptance, got error: %v", err)
	}
	if record.PreviousCycle == nil {
		t.Fatal("expected non-nil PreviousCycle")
	}
	if record.PreviousCycle.Outcome != "never_closed" {
		t.Errorf("outcome = %q, want never_closed", record.PreviousCycle.Outcome)
	}
	if record.PreviousCycle.CycleID != nil {
		t.Errorf("expected nil CycleID, got %v", *record.PreviousCycle.CycleID)
	}
	if record.PreviousCycle.TriggerSource != nil {
		t.Errorf("expected nil TriggerSource, got %v", *record.PreviousCycle.TriggerSource)
	}
	if record.PreviousCycle.LastStage != nil {
		t.Errorf("expected nil LastStage, got %v", *record.PreviousCycle.LastStage)
	}
}

func TestValidateRejectsMissingDegradedKey(t *testing.T) {
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": null,
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	_, err := Validate(wire)
	if err == nil {
		t.Fatal("expected rejection for missing degraded key, got nil")
	}
	requireFieldError(t, err, "degraded")
}

func TestValidateRejectsNonStringDegradedValue(t *testing.T) {
	// degraded is a nullable string, never any other JSON type. A number
	// fails json.Unmarshal into a string, which must be distinguished from
	// an off-vocabulary string value by its own Reason text -- otherwise a
	// broken decode-error check and a broken vocabulary check would be
	// indistinguishable from the caller's point of view.
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": 42,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": null,
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": []
	}`
	wire := decodeReport(t, body)
	_, err := Validate(wire)
	var fieldErr *FieldError
	if !errors.As(err, &fieldErr) {
		t.Fatalf("expected rejection for non-string degraded value, got %v", err)
	}
	if fieldErr.Field != "degraded" {
		t.Errorf("field = %q, want degraded", fieldErr.Field)
	}
	if fieldErr.Reason != "must be a string or null" {
		t.Errorf("reason = %q, want %q", fieldErr.Reason, "must be a string or null")
	}
}

func TestValidateRecentEventsReserializedDropsInjectedField(t *testing.T) {
	body := `{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": null,
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": [
	    {"source": "sync_cycle", "event": "ws_opened", "cause": "timeout", "first_at": 1, "last_at": 2, "count": 1, "injected_field": "should not survive"}
	  ]
	}`
	wire := decodeReport(t, body)
	record, err := Validate(wire)
	if err != nil {
		t.Fatalf("expected acceptance, got error: %v", err)
	}
	reserialized, err := json.Marshal(record.RecentEvents)
	if err != nil {
		t.Fatalf("marshal recent events: %v", err)
	}
	if strings.Contains(string(reserialized), "injected_field") {
		t.Errorf("expected injected_field to be dropped by re-serialization, got %s", reserialized)
	}
}

// recentEventsJSON builds a recent_events array of the given length, used to
// probe the 32-entry acceptance boundary.
func recentEventsJSON(count int) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i := 0; i < count; i++ {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"source": "sync_cycle", "event": "ws_opened", "cause": "timeout", "first_at": 1, "last_at": 2, "count": 1}`)
	}
	sb.WriteString("]")
	return sb.String()
}

// reportWithRecentEvents embeds a caller-supplied recent_events array into an
// otherwise valid report body.
func reportWithRecentEvents(eventsJSON string) string {
	return fmt.Sprintf(`{
	  "cycle_id": "11111111-1111-1111-1111-111111111111",
	  "degraded": null,
	  "trigger_source": "foreground_service",
	  "app_state": "background",
	  "previous_cycle": null,
	  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
	  "recent_events": %s
	}`, eventsJSON)
}

func TestValidateRecentEventsCapAt32(t *testing.T) {
	t.Run("32 accepted", func(t *testing.T) {
		wire := decodeReport(t, reportWithRecentEvents(recentEventsJSON(32)))
		record, err := Validate(wire)
		if err != nil {
			t.Fatalf("expected 32 entries to be accepted, got error: %v", err)
		}
		if len(record.RecentEvents) != 32 {
			t.Errorf("len = %d, want 32", len(record.RecentEvents))
		}
	})

	t.Run("33 rejected", func(t *testing.T) {
		wire := decodeReport(t, reportWithRecentEvents(recentEventsJSON(33)))
		_, err := Validate(wire)
		if err == nil {
			t.Fatal("expected rejection for 33 recent_events entries, got nil")
		}
		requireFieldError(t, err, "recent_events")
	})
}

func TestValidateRejectsAdversarialPayload(t *testing.T) {
	// error_fingerprint is the one shape-constrained (non-vocabulary) string
	// field in the envelope: a filesystem path, a SQL fragment, and an
	// anime title all fail its ^[0-9a-f]{8}$ shape and so are all rejected
	// -- none of them is ever coerced or partially accepted.
	cases := []struct {
		name    string
		payload string
	}{
		{"filesystem_path", "/etc/passwd"},
		{"sql_fragment", "'; DROP TABLE device_sync_diagnostics; --"},
		{"anime_title", "Shingeki no Kyojin"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := fmt.Sprintf(`{
			  "cycle_id": "11111111-1111-1111-1111-111111111111",
			  "degraded": null,
			  "trigger_source": "foreground_service",
			  "app_state": "background",
			  "previous_cycle": {"outcome": "completed", "error_fingerprint": %q},
			  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
			  "recent_events": []
			}`, tc.payload)
			wire := decodeReport(t, body)
			_, err := Validate(wire)
			if err == nil {
				t.Fatalf("expected rejection for adversarial payload %q, got nil", tc.payload)
			}
			requireFieldError(t, err, "previous_cycle.error_fingerprint")
		})
	}
}

func TestValidateNativeErrcodeByteBounds(t *testing.T) {
	cases := []struct {
		name      string
		value     int
		wantError bool
	}{
		{"zero_accepted", 0, false},
		{"max_boundary_accepted", 65535, false},
		{"over_max_rejected", 65536, true},
		{"far_out_of_range_rejected", 70000, true},
		{"negative_rejected", -1, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := fmt.Sprintf(`{
			  "cycle_id": "11111111-1111-1111-1111-111111111111",
			  "degraded": null,
			  "trigger_source": "foreground_service",
			  "app_state": "background",
			  "previous_cycle": {"outcome": "completed", "native_errcode_byte": %d},
			  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 0, "cursor": 0},
			  "recent_events": []
			}`, tc.value)
			wire := decodeReport(t, body)
			_, err := Validate(wire)
			if tc.wantError {
				if err == nil {
					t.Fatalf("expected rejection for native_errcode_byte=%d, got nil", tc.value)
				}
				requireFieldError(t, err, "previous_cycle.native_errcode_byte")
			} else if err != nil {
				t.Errorf("expected acceptance for native_errcode_byte=%d, got error: %v", tc.value, err)
			}
		})
	}
}
