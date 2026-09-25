package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"

	"autoreas-bridge/internal/observability/syncdiag"
)

// episodeActionRetentionLimit is this kind's own row cap. Episode actions are
// per-episode user actions, so this kind is written far more often than
// cycle_report is; the cap is deliberately larger so both kinds retain a
// comparable time window, since one count cap over a higher-frequency kind
// keeps a much shorter one. It is a named constant rather than a read of
// syncdiag.RetentionLimit() because retention is per kind: sharing the number
// would let tuning one kind's traffic silently retune the other's history.
// Changing this value later rewrites no row -- retention is enforced at prune
// time, never at write time -- so it is not a migration.
const episodeActionRetentionLimit = 20000

// The phase vocabulary and the one outcome member the rules branch on. Named
// constants rather than inline strings: the cross-field rules below compare
// against these, and a typo in one branch would otherwise be indistinguishable
// from a phase that carries no rule at all.
const (
	episodeActionPhaseReceived = "received"
	episodeActionPhaseSkipped  = "skipped"
	episodeActionPhaseFinished = "finished"
	episodeActionPhaseSync     = "sync"
	episodeActionOutcomeFailed = "failed"
)

// episodeActionActions gates action. Every vocabulary here is a distinctly
// named set owned by the field it gates, never a reuse of a neighbouring set
// that happens to share members: a shared declaration would make widening one
// field silently widen another, and no reviewer of either field would see it.
var episodeActionActions = map[string]struct{}{
	"episode_plus_one":   {},
	"episode_minus_one":  {},
	"episode_plus_half":  {},
	"episode_minus_half": {},
}

// episodeActionPhases gates phase.
var episodeActionPhases = map[string]struct{}{
	episodeActionPhaseReceived: {},
	episodeActionPhaseSkipped:  {},
	episodeActionPhaseFinished: {},
	episodeActionPhaseSync:     {},
}

// episodeActionFinishedOutcomes and episodeActionSyncOutcomes are two named
// sets on purpose, even though "failed" is a member of both. Collapsing them
// into one flat set would make outcome membership independent of phase, so
// finished+ok and sync+committed would each be accepted by the same single
// test -- exactly the pair the cross-field rule exists to refuse. Two sets are
// what makes that rule a rule instead of two membership tests that can drift
// apart and between them accept both.
var (
	episodeActionFinishedOutcomes = map[string]struct{}{
		"committed":                {},
		episodeActionOutcomeFailed: {},
	}
	episodeActionSyncOutcomes = map[string]struct{}{
		"ok":                       {},
		episodeActionOutcomeFailed: {},
	}
)

// episodeActionReasons gates reason.
var episodeActionReasons = map[string]struct{}{
	"in_flight":      {},
	"anime_missing":  {},
	"db_unavailable": {},
}

// episodeActionCauses gates cause. Its members are byte-identical to
// syncdiag.syncErrorCauses today, and it is still its own set rather than a
// read of that one: the two describe different observations from different
// clients (one sync cycle's previous-phase error class, one episode action's
// failure class) and only coincide for now. Reading the other package's map
// would couple them, so adding a cause for a sync cycle would silently widen
// what this kind accepts.
var episodeActionCauses = map[string]struct{}{
	"closed_resource": {},
	"lock_contention": {},
	"disk_full":       {},
	"io_error":        {},
	"timeout":         {},
	"unreachable":     {},
	"unknown":         {},
}

// wireEpisodeAction is the strict-decoded wire body of one episode_action.
// Every member whose absence must stay distinguishable from an explicit null
// is json.RawMessage rather than a pointer: a pointer collapses "key absent"
// and "key present, value null" into one nil, and these rules depend on that
// difference -- outcome must be ABSENT on received and skipped, reason must be
// ABSENT outside skipped, and duration_ms must be present AS an explicit null
// on every phase that carries no measurement.
type wireEpisodeAction struct {
	// Kind is the discriminator the endpoint already dispatched on. It is
	// declared here so an explicit kind: "episode_action" is not rejected as
	// an undeclared field by DisallowUnknownFields. Nothing validates it --
	// this decoder only ever sees a body the registry already resolved to
	// this kind, and a rule here could contradict that resolution.
	Kind          string          `json:"kind"`
	ObservationID string          `json:"observation_id"`
	Action        string          `json:"action"`
	Phase         string          `json:"phase"`
	ObservedAtMS  json.RawMessage `json:"observed_at_ms"`
	CorrelationID string          `json:"correlation_id"`
	Outcome       json.RawMessage `json:"outcome"`
	Reason        json.RawMessage `json:"reason"`
	Cause         json.RawMessage `json:"cause"`
	DurationMS    json.RawMessage `json:"duration_ms"`
}

// episodeActionPayload is the stored seven-key shape. Every key is always
// present, with an explicit null in each slot the phase leaves empty, and
// nothing is omitempty: a stable key set lets a later reader query payload_json
// without first establishing which keys a given phase happens to carry. It
// carries neither kind, observation_id nor observed_at_ms, because the
// envelope columns own all three and a copy here could only contradict them.
type episodeActionPayload struct {
	Action        string  `json:"action"`
	Phase         string  `json:"phase"`
	CorrelationID string  `json:"correlation_id"`
	Outcome       *string `json:"outcome"`
	Reason        *string `json:"reason"`
	Cause         *string `json:"cause"`
	DurationMS    *int64  `json:"duration_ms"`
}

// EpisodeActionKind is the episode_action kind: one observable step of a
// mobile episode action, reported as its own event so a step that never
// finishes is still recorded. It is one complete declaration -- decoder,
// validation, stored shape and retention -- so nothing outside this file has
// to know its vocabulary.
type EpisodeActionKind struct{}

// Name reports the wire discriminator. This kind is never inferable from
// absence: the absent kind key is the frozen cycle_report default, so a body
// that means to be an episode_action must name it.
func (EpisodeActionKind) Name() KindName { return KindEpisodeAction }

// RetentionLimit reports this kind's own declared row cap.
func (EpisodeActionKind) RetentionLimit() int { return episodeActionRetentionLimit }

// Decode strict-decodes and validates one episode_action body. It rejects and
// never coerces, and every rejection names the field it refused, because
// mobile logs the rejection: a generic answer would leave the client guessing
// which of six vocabularies turned the body down.
func (EpisodeActionKind) Decode(body []byte) (Validated, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()

	var wire wireEpisodeAction
	if err := decoder.Decode(&wire); err != nil {
		return Validated{}, fmt.Errorf("telemetry: decode %s body: %w", KindEpisodeAction, err)
	}

	// Identity first: unlike every vocabulary below, these two carry no
	// enumeration, so empty is the only way to be wrong and there is nothing
	// to check them against.
	if wire.ObservationID == "" {
		return Validated{}, &syncdiag.FieldError{Field: "observation_id", Reason: "must be a non-empty string"}
	}
	if wire.CorrelationID == "" {
		return Validated{}, &syncdiag.FieldError{Field: "correlation_id", Reason: "must be a non-empty string"}
	}
	if !inVocabulary(episodeActionActions, wire.Action) {
		return Validated{}, &syncdiag.FieldError{Field: "action", Reason: "not a member of the closed vocabulary"}
	}
	if !inVocabulary(episodeActionPhases, wire.Phase) {
		return Validated{}, &syncdiag.FieldError{Field: "phase", Reason: "not a member of the closed vocabulary"}
	}

	observedAtMS, err := episodeActionObservedAtMS(wire.ObservedAtMS)
	if err != nil {
		return Validated{}, err
	}
	outcome, err := episodeActionOutcome(wire.Phase, wire.Outcome)
	if err != nil {
		return Validated{}, err
	}
	reason, err := episodeActionReason(wire.Phase, wire.Reason)
	if err != nil {
		return Validated{}, err
	}
	// cause is resolved after outcome because it is admissible only on
	// finished+failed: the combination cannot be judged from phase alone.
	cause, err := episodeActionCause(wire.Phase, outcome, wire.Cause)
	if err != nil {
		return Validated{}, err
	}
	durationMS, err := episodeActionDurationMS(wire.Phase, wire.DurationMS)
	if err != nil {
		return Validated{}, err
	}

	// The payload is re-serialized from these validated values, never copied
	// from the request bytes, and every value that reaches it has already been
	// proven a member of the vocabulary that gates it.
	payload, err := json.Marshal(episodeActionPayload{
		Action:        wire.Action,
		Phase:         wire.Phase,
		CorrelationID: wire.CorrelationID,
		Outcome:       outcome,
		Reason:        reason,
		Cause:         cause,
		DurationMS:    durationMS,
	})
	if err != nil {
		return Validated{}, fmt.Errorf("telemetry: marshal %s payload: %w", KindEpisodeAction, err)
	}

	// EventID is the wire observation_id verbatim: it is the kind-scoped
	// idempotency key the store enforces under UNIQUE (kind, event_id), and
	// observation_id is the one value in this body that claims to name the
	// event. Degraded stays nil because this kind declares no fidelity signal;
	// the envelope's degraded column belongs to the kinds that do.
	return Validated{
		EventID:      wire.ObservationID,
		ObservedAtMS: &observedAtMS,
		Payload:      payload,
	}, nil
}

// wireString decodes one present raw wire value as a string, refusing a
// present null. json.Unmarshal leaves a string destination untouched and
// reports no error for a JSON null, so without this guard a null would reach a
// vocabulary check as the empty string -- a value the client never sent, and
// one that would then be reported as a misspelled member rather than as a
// null.
func wireString(field string, raw json.RawMessage) (string, error) {
	var value string
	if bytes.Equal(raw, []byte("null")) || json.Unmarshal(raw, &value) != nil {
		return "", &syncdiag.FieldError{Field: field, Reason: "must be a string"}
	}
	return value, nil
}

// episodeActionObservedAtMS resolves the required client event time. Absence
// and null are refusals rather than a zero: the envelope records receipt time
// separately, so a zero here would claim the event happened at the epoch
// instead of declaring that the client did not say when it did.
func episodeActionObservedAtMS(raw json.RawMessage) (int64, error) {
	if raw == nil {
		return 0, &syncdiag.FieldError{Field: "observed_at_ms", Reason: "missing required key"}
	}
	var value int64
	if bytes.Equal(raw, []byte("null")) || json.Unmarshal(raw, &value) != nil {
		return 0, &syncdiag.FieldError{Field: "observed_at_ms", Reason: "must be an integer"}
	}
	if value < 0 {
		return 0, &syncdiag.FieldError{Field: "observed_at_ms", Reason: "must not be negative"}
	}
	return value, nil
}

// episodeActionAdmittedOutcomes returns the one outcome vocabulary a phase
// admits, and whether the phase carries an outcome at all. It is the single
// cross-field point: the rule is one lookup of phase, not one membership test
// per outcome value, because independent tests cannot refuse finished+ok and
// sync+committed -- each of those values is a legitimate member of the other
// phase's set.
func episodeActionAdmittedOutcomes(phase string) (map[string]struct{}, bool) {
	switch phase {
	case episodeActionPhaseFinished:
		return episodeActionFinishedOutcomes, true
	case episodeActionPhaseSync:
		return episodeActionSyncOutcomes, true
	default:
		return nil, false
	}
}

// episodeActionOutcome resolves outcome against phase. A phase that admits no
// outcome must not carry the key at all, including as an explicit null: the
// client chose to send that value, and this kind refuses to interpret a value
// its phase has no meaning for.
func episodeActionOutcome(phase string, raw json.RawMessage) (*string, error) {
	admitted, carriesOutcome := episodeActionAdmittedOutcomes(phase)
	if !carriesOutcome {
		if raw != nil {
			return nil, &syncdiag.FieldError{Field: "outcome", Reason: "must be absent on phase " + phase}
		}
		return nil, nil
	}
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: "outcome", Reason: "missing required key"}
	}
	value, err := wireString("outcome", raw)
	if err != nil {
		return nil, err
	}
	if !inVocabulary(admitted, value) {
		return nil, &syncdiag.FieldError{Field: "outcome", Reason: "not a member of the closed vocabulary for phase " + phase}
	}
	return &value, nil
}

// episodeActionReason resolves reason against phase: required on skipped and
// absent everywhere else. A reason on a finished action would be a second,
// contradictable answer to the question cause already answers for a failure.
func episodeActionReason(phase string, raw json.RawMessage) (*string, error) {
	if phase != episodeActionPhaseSkipped {
		if raw != nil {
			return nil, &syncdiag.FieldError{Field: "reason", Reason: "must be absent on phase " + phase}
		}
		return nil, nil
	}
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: "reason", Reason: "missing required key"}
	}
	value, err := wireString("reason", raw)
	if err != nil {
		return nil, err
	}
	if !inVocabulary(episodeActionReasons, value) {
		return nil, &syncdiag.FieldError{Field: "reason", Reason: "not a member of the closed vocabulary"}
	}
	return &value, nil
}

// episodeActionCause resolves cause against the one combination that admits
// it: a finished phase whose outcome is failed. Every other combination must
// omit the key, and the successful finished one is included in that -- a cause
// beside outcome committed would describe a failure that never happened.
func episodeActionCause(phase string, outcome *string, raw json.RawMessage) (*string, error) {
	admitsCause := phase == episodeActionPhaseFinished && outcome != nil && *outcome == episodeActionOutcomeFailed
	if !admitsCause {
		if raw != nil {
			return nil, &syncdiag.FieldError{Field: "cause", Reason: "must be absent unless phase is finished with outcome failed"}
		}
		return nil, nil
	}
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: "cause", Reason: "missing required key"}
	}
	value, err := wireString("cause", raw)
	if err != nil {
		return nil, err
	}
	if !inVocabulary(episodeActionCauses, value) {
		return nil, &syncdiag.FieldError{Field: "cause", Reason: "not a member of the closed vocabulary"}
	}
	return &value, nil
}

// episodeActionDurationMS resolves duration_ms. The key is present on every
// payload and only its value depends on phase: finished must report a
// measurement, and every other phase must report an explicit null rather than
// 0, because a zero duration on a phase that has none is a value a reader
// cannot tell from a real instantaneous measurement.
func episodeActionDurationMS(phase string, raw json.RawMessage) (*int64, error) {
	if raw == nil {
		return nil, &syncdiag.FieldError{Field: "duration_ms", Reason: "missing required key"}
	}
	if phase != episodeActionPhaseFinished {
		if !bytes.Equal(raw, []byte("null")) {
			return nil, &syncdiag.FieldError{Field: "duration_ms", Reason: "must be null on phase " + phase}
		}
		return nil, nil
	}
	var value int64
	if bytes.Equal(raw, []byte("null")) || json.Unmarshal(raw, &value) != nil {
		return nil, &syncdiag.FieldError{Field: "duration_ms", Reason: "must be an integer on phase " + phase}
	}
	return &value, nil
}

// inVocabulary reports whether value is a member of one closed vocabulary.
// Membership is a set lookup rather than a slice scan so the declaration reads
// as the set it is; a missing member is a rejection everywhere it is used.
func inVocabulary(vocabulary map[string]struct{}, value string) bool {
	_, present := vocabulary[value]
	return present
}
