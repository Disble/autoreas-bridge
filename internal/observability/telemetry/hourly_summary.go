package telemetry

import (
	"encoding/json"
	"fmt"
	"math"

	"autoreas-bridge/internal/observability/syncdiag"
)

// KindHourlySummary is one closed hour of the tablet's own sync attempts,
// counted per scheduler and outcome. Like every kind after cycle_report it has
// no default and must be named.
const KindHourlySummary KindName = "hourly_summary"

// hourlySummaryRetentionLimit is this kind's own row cap: one body per closed
// hour is 24 a day, kept for the 90 days Bridge retains mobile reports. It is
// the hourly share of the 50 new reports a day the owner approved across the
// new kinds; runtime_transition holds the rest.
const hourlySummaryRetentionLimit = 24 * 90

// The bounds the wire contract declares. A count above hourlySummaryMaxCount
// in one hour is a client bug, not traffic (a 15-second tick is 240 an hour);
// a duration beyond one hour cannot belong to an attempt inside a closed hour.
// The counts cap is today's 9 schedulers times 7 outcomes (63 distinct pairs)
// plus one, and the deaths cap is generous for two processes; together they
// keep the largest legal body inside the 8 KiB transport limit.
const (
	hourlySummaryMaxCount         = 100000
	hourlySummaryMaxDurationMS    = 3600000
	hourlySummaryMaxCounts        = 64
	hourlySummaryMaxProcessDeaths = 16
)

// hourlySummaryOutcomes gates counts[].outcome: how one sync attempt ended,
// in the words agreed with mobile. It is its own set and not syncdiag's cycle
// outcomes, which describe a different observation (one cycle's close).
var hourlySummaryOutcomes = map[string]struct{}{
	"closed":                  {},
	"failed":                  {},
	"presence_refused":        {},
	"schema_not_ready":        {},
	"skipped_owned_by_ticker": {},
	"unsettled":               {},
	"crashed":                 {},
}

// reportProcessNames gates the process a mobile report names: the app's main
// process or its separate sync process. Both mobile report kinds read it,
// because both describe the same two processes.
var reportProcessNames = map[string]struct{}{
	"main": {},
	"sync": {},
}

// wireHourlySummary is the strict-decoded wire body of one hourly_summary.
// Members are json.RawMessage so an absent key stays distinguishable from an
// explicit null.
type wireHourlySummary struct {
	// Kind is the discriminator the endpoint already dispatched on; declared
	// only so DisallowUnknownFields does not reject it.
	Kind          string          `json:"kind"`
	ObservationID json.RawMessage `json:"observation_id"`
	HourStartMS   json.RawMessage `json:"hour_start_ms"`
	Counts        json.RawMessage `json:"counts"`
	DroppedCount  json.RawMessage `json:"dropped_count"`
	ProcessDeaths json.RawMessage `json:"process_deaths"`
}

// wireHourlyCount is one strict-decoded counts item.
type wireHourlyCount struct {
	TriggerSource json.RawMessage `json:"trigger_source"`
	Outcome       json.RawMessage `json:"outcome"`
	Count         json.RawMessage `json:"count"`
	MaxDurationMS json.RawMessage `json:"max_duration_ms"`
}

// wireProcessDeath is one strict-decoded process_deaths item.
type wireProcessDeath struct {
	ProcessName json.RawMessage `json:"process_name"`
	Reason      json.RawMessage `json:"reason"`
	Count       json.RawMessage `json:"count"`
}

// hourlyCount is one stored counts item; max_duration_ms is always present,
// null when the tablet measured none.
type hourlyCount struct {
	TriggerSource string `json:"trigger_source"`
	Outcome       string `json:"outcome"`
	Count         int64  `json:"count"`
	MaxDurationMS *int64 `json:"max_duration_ms"`
}

// processDeath is one stored process_deaths item.
type processDeath struct {
	ProcessName string `json:"process_name"`
	Reason      string `json:"reason"`
	Count       int64  `json:"count"`
}

// hourlySummaryPayload is the stored three-key shape. Both arrays are always
// present and never null. It carries neither kind, observation_id nor
// hour_start_ms: the envelope's event_id and observed_at_ms own them.
type hourlySummaryPayload struct {
	Counts        []hourlyCount  `json:"counts"`
	DroppedCount  int64          `json:"dropped_count"`
	ProcessDeaths []processDeath `json:"process_deaths"`
}

// HourlySummaryKind is the hourly_summary kind: one complete declaration --
// decoder, validation, stored shape and retention.
type HourlySummaryKind struct{}

// Name reports the wire discriminator.
func (HourlySummaryKind) Name() KindName { return KindHourlySummary }

// RetentionLimit reports this kind's own declared row cap.
func (HourlySummaryKind) RetentionLimit() int { return hourlySummaryRetentionLimit }

// Decode strict-decodes and validates one hourly_summary body. The event id
// is observation_id (install id + hour), so a repost of the same hour is a
// duplicate and the first write wins. observed_at_ms is the hour's start.
func (HourlySummaryKind) Decode(body []byte) (Validated, error) {
	var wire wireHourlySummary
	if err := strictDecode(body, &wire); err != nil {
		if fieldErr := undeclaredKey("", err); fieldErr != nil {
			return Validated{}, fieldErr
		}
		return Validated{}, fmt.Errorf("telemetry: decode %s body: %w", KindHourlySummary, err)
	}

	observationID, err := decodeObservationID(wire.ObservationID)
	if err != nil {
		return Validated{}, err
	}
	hourStartMS, err := boundedInt("hour_start_ms", wire.HourStartMS, 0, math.MaxInt64)
	if err != nil {
		return Validated{}, err
	}
	var payload hourlySummaryPayload
	if payload.Counts, err = hourlyCounts(wire.Counts); err != nil {
		return Validated{}, err
	}
	if payload.DroppedCount, err = boundedInt("dropped_count", wire.DroppedCount, 0, hourlySummaryMaxCount); err != nil {
		return Validated{}, err
	}
	if payload.ProcessDeaths, err = processDeaths(wire.ProcessDeaths); err != nil {
		return Validated{}, err
	}

	stored, err := json.Marshal(payload)
	if err != nil {
		return Validated{}, fmt.Errorf("telemetry: marshal %s payload: %w", KindHourlySummary, err)
	}
	return Validated{EventID: observationID, ObservedAtMS: &hourStartMS, Payload: stored}, nil
}

// hourlyCounts validates the required counts array. One scheduler and outcome
// pair appears at most once, so a reader never has to decide which of two
// counts for the same pair is true.
func hourlyCounts(raw json.RawMessage) ([]hourlyCount, error) {
	items, err := objectItems("counts", raw, hourlySummaryMaxCounts, true)
	if err != nil {
		return nil, err
	}
	counts := make([]hourlyCount, 0, len(items))
	seen := make(map[[2]string]struct{}, len(items))
	for i, item := range items {
		prefix := fmt.Sprintf("counts[%d]", i)
		count, err := hourlyCountItem(prefix, item)
		if err != nil {
			return nil, err
		}
		key := [2]string{count.TriggerSource, count.Outcome}
		if _, duplicate := seen[key]; duplicate {
			return nil, &syncdiag.FieldError{Field: prefix, Reason: "repeats a trigger_source and outcome pair"}
		}
		seen[key] = struct{}{}
		counts = append(counts, count)
	}
	return counts, nil
}

// hourlyCountItem validates one counts item in wire order.
func hourlyCountItem(prefix string, item json.RawMessage) (hourlyCount, error) {
	var wire wireHourlyCount
	var count hourlyCount
	if err := strictItem(prefix, item, &wire); err != nil {
		return count, err
	}
	trigger, err := requiredString(prefix+".trigger_source", wire.TriggerSource)
	if err != nil {
		return count, err
	}
	if !syncdiag.IsSyncAttemptTriggerSource(trigger) {
		return count, &syncdiag.FieldError{Field: prefix + ".trigger_source", Reason: "not a member of the closed vocabulary"}
	}
	count.TriggerSource = trigger
	if count.Outcome, err = vocabularyString(prefix+".outcome", wire.Outcome, hourlySummaryOutcomes); err != nil {
		return count, err
	}
	if count.Count, err = boundedInt(prefix+".count", wire.Count, 0, hourlySummaryMaxCount); err != nil {
		return count, err
	}
	count.MaxDurationMS, err = optionalBoundedInt(prefix+".max_duration_ms", wire.MaxDurationMS, 0, hourlySummaryMaxDurationMS)
	return count, err
}

// processDeaths validates the optional process_deaths array; absent or null is
// stored as an empty array. A death entry says a process died at least once,
// so its count starts at one, and one process and reason pair appears once.
func processDeaths(raw json.RawMessage) ([]processDeath, error) {
	items, err := objectItems("process_deaths", raw, hourlySummaryMaxProcessDeaths, false)
	if err != nil {
		return nil, err
	}
	deaths := make([]processDeath, 0, len(items))
	seen := make(map[[2]string]struct{}, len(items))
	for i, item := range items {
		prefix := fmt.Sprintf("process_deaths[%d]", i)
		var wire wireProcessDeath
		if err := strictItem(prefix, item, &wire); err != nil {
			return nil, err
		}
		var death processDeath
		if death.ProcessName, err = vocabularyString(prefix+".process_name", wire.ProcessName, reportProcessNames); err != nil {
			return nil, err
		}
		if death.Reason, err = patternString(prefix+".reason", wire.Reason, reportCodePattern); err != nil {
			return nil, err
		}
		if death.Count, err = boundedInt(prefix+".count", wire.Count, 1, hourlySummaryMaxCount); err != nil {
			return nil, err
		}
		key := [2]string{death.ProcessName, death.Reason}
		if _, duplicate := seen[key]; duplicate {
			return nil, &syncdiag.FieldError{Field: prefix, Reason: "repeats a process_name and reason pair"}
		}
		seen[key] = struct{}{}
		deaths = append(deaths, death)
	}
	return deaths, nil
}
