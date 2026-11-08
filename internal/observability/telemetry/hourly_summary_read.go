package telemetry

import (
	"encoding/json"
	"fmt"
)

// HourlySummary is one stored hourly_summary payload in its read shape: what
// the tablet reported for one closed hour, every word as stored. Both lists are
// never nil, in the order the tablet sent them.
type HourlySummary struct {
	// Counts are the tablet's sync attempts per scheduler and outcome.
	Counts []HourlyCount
	// DroppedCount is how many of the hour's reports the tablet dropped.
	DroppedCount int64
	// ProcessDeaths are the tablet's process deaths of the hour.
	ProcessDeaths []ProcessDeath
}

// HourlyCount is one scheduler and outcome pair of an hour.
type HourlyCount struct {
	// TriggerSource is the scheduler, such as foreground_service.
	TriggerSource string
	// Outcome is how the attempts ended, such as presence_refused.
	Outcome string
	// Count is the number of attempts.
	Count int64
	// MaxDurationMS is the slowest attempt, nil when the tablet measured none.
	MaxDurationMS *int64
}

// ProcessDeath is one process and reason pair of an hour's deaths.
type ProcessDeath struct {
	// ProcessName is main or sync.
	ProcessName string
	// Reason is the recorded reason code, such as low_memory.
	Reason string
	// Count is how many times it died for that reason, at least one.
	Count int64
}

// ReadHourlySummary reads a payload hourly_summary stored. The kind's decoder
// is its only writer, so a payload that does not decode is corrupt and is an
// error, never an hour that reported nothing.
func ReadHourlySummary(payload []byte) (HourlySummary, error) {
	var stored hourlySummaryPayload
	if err := json.Unmarshal(payload, &stored); err != nil {
		return HourlySummary{}, fmt.Errorf("telemetry: read %s payload: %w", KindHourlySummary, err)
	}
	summary := HourlySummary{
		Counts:        make([]HourlyCount, 0, len(stored.Counts)),
		DroppedCount:  stored.DroppedCount,
		ProcessDeaths: make([]ProcessDeath, 0, len(stored.ProcessDeaths)),
	}
	for _, count := range stored.Counts {
		summary.Counts = append(summary.Counts, HourlyCount(count))
	}
	for _, death := range stored.ProcessDeaths {
		summary.ProcessDeaths = append(summary.ProcessDeaths, ProcessDeath(death))
	}
	return summary, nil
}
