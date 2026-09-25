package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"

	"autoreas-bridge/internal/observability/syncdiag"
)

// CycleReportKind is the cycle_report kind: the sync-cycle diagnostics
// report mobile already sends. It is one complete declaration, so the
// discriminated store knows nothing about sync cycles and this type is the
// only place in the package that does.
type CycleReportKind struct{}

// Name reports the wire discriminator, byte-identical to the kind an absent
// kind key decodes as.
func (CycleReportKind) Name() KindName { return KindCycleReport }

// RetentionLimit reports the shared sync-diagnostics row cap, read from the
// syncdiag package rather than copied: a second literal here would be a
// second owner of the same number and the two would drift.
func (CycleReportKind) RetentionLimit() int { return syncdiag.RetentionLimit() }

// Decode strict-decodes one cycle_report body and validates it with the
// unchanged syncdiag validator, so this kind's behaviour is the behaviour
// that already ships. DisallowUnknownFields is what keeps the endpoint's
// 400-on-undeclared-field response intact, and an explicit kind key is
// declared on syncdiag.WireReport precisely so this decode does not reject
// it. The validator's error is returned unwrapped: a *syncdiag.FieldError is
// the endpoint's "which field" 400 shape, and nothing here reinterprets it.
func (CycleReportKind) Decode(body []byte) (Validated, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()

	var wire syncdiag.WireReport
	if err := decoder.Decode(&wire); err != nil {
		return Validated{}, fmt.Errorf("telemetry: decode %s body: %w", KindCycleReport, err)
	}
	record, err := syncdiag.Validate(wire)
	if err != nil {
		return Validated{}, err
	}
	payload, err := json.Marshal(record)
	if err != nil {
		return Validated{}, fmt.Errorf("telemetry: marshal %s payload: %w", KindCycleReport, err)
	}

	// ObservedAtMS stays nil on purpose: this kind's body carries no client
	// event time, so the envelope records receipt time instead. Device
	// identity and receipt time come from the authenticated token and the
	// receipt clock, and degraded has its own envelope column -- the record
	// tags all three json:"-" so the payload omits them rather than repeating
	// a value the columns already own and could be contradicted by.
	return Validated{
		EventID:      record.CycleID,
		ObservedAtMS: nil,
		Degraded:     record.Degraded,
		Payload:      payload,
	}, nil
}
