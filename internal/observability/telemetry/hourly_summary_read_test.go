package telemetry

import (
	"reflect"
	"testing"
)

// TestReadHourlySummaryReadsTheStoredPayload reads the payload the real
// decoder stores from the canonical body: every count and death as stored, in
// stored order, a count without a duration as nil, and a stored payload that
// does not decode as an error, never as an empty hour.
func TestReadHourlySummaryReadsTheStoredPayload(t *testing.T) {
	t.Parallel()

	validated, err := HourlySummaryKind{}.Decode([]byte(hourlySummaryBody))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	got, err := ReadHourlySummary(validated.Payload)
	if err != nil {
		t.Fatalf("ReadHourlySummary() error = %v", err)
	}
	slowest := int64(1412)
	want := HourlySummary{
		Counts: []HourlyCount{
			{TriggerSource: "foreground_service", Outcome: "closed", Count: 31, MaxDurationMS: &slowest},
			{TriggerSource: "foreground_service", Outcome: "failed", Count: 4},
		},
		ProcessDeaths: []ProcessDeath{{ProcessName: "sync", Reason: "low_memory", Count: 1}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ReadHourlySummary() = %+v\nwant %+v", got, want)
	}

	dropped, err := ReadHourlySummary([]byte(`{"counts":[],"dropped_count":7,"process_deaths":[]}`))
	if err != nil || dropped.DroppedCount != 7 || dropped.Counts == nil || dropped.ProcessDeaths == nil {
		t.Fatalf("ReadHourlySummary(empty hour) = %+v, %v; want 7 dropped and empty, non-nil lists", dropped, err)
	}

	if _, err := ReadHourlySummary([]byte(`{"counts":7}`)); err == nil {
		t.Fatal("ReadHourlySummary(undecodable) succeeded, want an error")
	}
}
