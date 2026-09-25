package telemetry

import (
	"reflect"
	"strings"
	"testing"
)

// validCycleReportBody is a complete, valid request body for the
// cycle_report kind. It deliberately declares no kind key: that is the
// frozen legacy default every already-deployed mobile build sends, and the
// body this kind must keep decoding byte-identically.
const validCycleReportBody = `{
  "cycle_id": "cycle-legacy",
  "degraded": null,
  "trigger_source": "foreground_service",
  "app_state": "background",
  "previous_cycle": {
    "cycle_id": "cycle-previous",
    "trigger_source": "manual",
    "outcome": "completed",
    "last_stage": "closed",
    "started_at": 1000,
    "elapsed_ms": 500,
    "error_name": "unknown",
    "native_errcode_byte": 5,
    "error_stage": "unknown",
    "error_cause": "unknown",
    "error_fingerprint": "3f2a91b0"
  },
  "counters": {"consecutive_unclosed_cycles": 0, "pending_ops_count": 2, "cursor": 42},
  "recent_events": [
    {"source": "sync_cycle", "event": "ws_opened", "cause": "timeout", "first_at": 1, "last_at": 2, "count": 3}
  ]
}`

// wantCycleReportPayload is the exact payload_json validCycleReportBody must
// store, written out as a literal instead of recomputed by marshalling the
// same record: a payload compared against a re-marshal of its own source
// proves only that encoding/json is deterministic, and passes with every tag
// removed. This literal is what fails when a tag is deleted or renamed, and
// it pins the three omissions the envelope columns own -- device_id,
// reported_at_ms and degraded never appear in the payload.
const wantCycleReportPayload = `{"cycle_id":"cycle-legacy","trigger_source":"foreground_service","app_state":"background","consecutive_unclosed_cycles":0,"pending_ops_count":2,"cursor":42,"recent_events":[{"source":"sync_cycle","event":"ws_opened","cause":"timeout","first_at":1,"last_at":2,"count":3}],"previous_cycle":{"cycle_id":"cycle-previous","trigger_source":"manual","outcome":"completed","last_stage":"closed","started_at":1000,"elapsed_ms":500,"error_name":"unknown","native_errcode_byte":5,"error_stage":"unknown","error_cause":"unknown","error_fingerprint":"3f2a91b0"}}`

// cycleReportBodyWithDeclaredKind inserts an explicit kind key into a valid
// body, so the explicit alias and the frozen legacy default can be compared
// against each other instead of each against a restatement of the contract.
func cycleReportBodyWithDeclaredKind(body string) string {
	return strings.Replace(body, `"degraded":`, `"kind": "`+KindCycleReport+`",`+"\n  "+`"degraded":`, 1)
}

// TestCycleReportKindDecodesBodyWithoutKindKey asserts the legacy default:
// a body with no kind key still decodes through the cycle_report kind, and
// the payload it produces is the stored payload contract exactly.
func TestCycleReportKindDecodesBodyWithoutKindKey(t *testing.T) {
	t.Parallel()

	validated, err := CycleReportKind{}.Decode([]byte(validCycleReportBody))
	if err != nil {
		t.Fatalf("expected the legacy body with no kind key to decode, got error: %v", err)
	}
	if validated.EventID != "cycle-legacy" {
		t.Fatalf("expected the idempotency key to be the validated cycle_id, got %q", validated.EventID)
	}
	// This body carries no client event time, and its degraded key is
	// explicitly null: both must stay nil rather than becoming a zero value.
	if validated.Degraded != nil || validated.ObservedAtMS != nil {
		t.Fatalf("expected nil degraded and observed_at_ms, got degraded=%v observed_at_ms=%v", validated.Degraded, validated.ObservedAtMS)
	}

	if string(validated.Payload) != wantCycleReportPayload {
		t.Fatalf("expected the stored payload to be %s, got %s", wantCycleReportPayload, validated.Payload)
	}
}

// TestCycleReportKindAcceptsExplicitKindAlias asserts a body that declares
// kind: "cycle_report" is not rejected as an undeclared field, and produces
// values indistinguishable from the legacy default -- the two spellings are
// one kind, not two.
func TestCycleReportKindAcceptsExplicitKindAlias(t *testing.T) {
	t.Parallel()

	legacy, err := CycleReportKind{}.Decode([]byte(validCycleReportBody))
	if err != nil {
		t.Fatalf("decode legacy body: %v", err)
	}
	alias, err := CycleReportKind{}.Decode([]byte(cycleReportBodyWithDeclaredKind(validCycleReportBody)))
	if err != nil {
		t.Fatalf("expected an explicit kind: %q key to be accepted rather than rejected as undeclared, got error: %v", KindCycleReport, err)
	}
	if !reflect.DeepEqual(alias, legacy) {
		t.Fatalf("expected the explicit alias to be indistinguishable from the legacy default, got %+v want %+v", alias, legacy)
	}
}

// TestTempPrintPayload is a temporary evidence probe.
func TestTempPrintPayload(t *testing.T) {
	validated, err := CycleReportKind{}.Decode([]byte(validCycleReportBody))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	t.Logf("PAYLOAD=%s", validated.Payload)
}
