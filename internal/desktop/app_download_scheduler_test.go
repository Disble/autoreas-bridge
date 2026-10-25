package desktop

import (
	"context"
	"reflect"
	"slices"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/schedule"
)

// TestStartupForwardsScheduleRunSettled pins the wiring every reader of a run's outcome depends
// on. download.run_finished fires from inside the run, before the scheduler stores its outcome
// and clears its running flag, so a schedule re-read on it can be stale; the scheduler's
// RunSettled is the point where a re-read is final. It reaches the WebView only through here,
// and a stored outcome reaches runtime_events (Activity, the request MCP) only through here:
// the scheduler is shared with Season, so it cannot name the fact itself.
func TestStartupForwardsScheduleRunSettled(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		settlement schedule.RunSettlement
		wantRow    *sharedlogger.LogEntry
	}{
		{
			name: "a recorded scheduled run is announced and logged with what was stored",
			settlement: schedule.RunSettlement{
				Trigger: "scheduled", Status: "ok", Recorded: true, StartedAtMs: 1000, NextRunAtMs: 2000,
			},
			wantRow: &sharedlogger.LogEntry{
				Domain: "schedule", Level: sharedlogger.LevelInfo, EventType: "schedule.run_settled",
				Message:  "scheduled download run recorded as ok",
				Metadata: map[string]any{"trigger": "scheduled", "status": "ok", "startedAtMs": int64(1000), "nextRunAtMs": int64(2000)},
			},
		},
		{
			name:       "a recorded missed-day run is logged with its day, and no unknown times",
			settlement: schedule.RunSettlement{Trigger: "missed_startup", Status: "partial", Recorded: true, LocalDate: "2026-07-26"},
			wantRow: &sharedlogger.LogEntry{
				Domain: "schedule", Level: sharedlogger.LevelInfo, EventType: "schedule.run_settled",
				Message:  "missed_startup download run recorded as partial",
				Metadata: map[string]any{"trigger": "missed_startup", "status": "partial", "localDate": "2026-07-26"},
			},
		},
		{
			name:       "a manual run stores nothing: announced, not logged",
			settlement: schedule.RunSettlement{Trigger: "manual", Status: "ok"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var captured schedule.Deps
			recorder := &emitRecorder{}
			memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{Capacity: 4096})
			app := newAppTestApp(t)
			app.emitFn = recorder.emit
			app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)
			app.newDownloadScheduler = func(deps schedule.Deps) schedule.Scheduler {
				captured = deps
				return schedule.NewScheduler(deps)
			}

			app.startup(context.Background())

			if captured.RunSettled == nil {
				t.Fatal("startup built the download scheduler with no RunSettled hook, so nobody learns a run's outcome is stored")
			}
			emittedBefore := len(recorder.names)
			loggedBefore := len(memLogger.Recent())
			captured.RunSettled(tc.settlement)

			if got := recorder.names[emittedBefore:]; !slices.Equal(got, []string{"schedule.run_settled"}) {
				t.Fatalf("RunSettled emitted %v, want exactly [schedule.run_settled]", got)
			}
			assertRunSettledRow(t, memLogger.Recent()[loggedBefore:], tc.wantRow)
		})
	}
}

// assertRunSettledRow checks the rows one RunSettled call wrote: none when want is nil, otherwise
// exactly want, with no correlation id.
func assertRunSettledRow(t *testing.T, rows []sharedlogger.LogEntry, want *sharedlogger.LogEntry) {
	t.Helper()
	if want == nil {
		if len(rows) != 0 {
			t.Fatalf("RunSettled logged %#v for an outcome nothing stored, want no row", rows)
		}
		return
	}
	if len(rows) != 1 {
		t.Fatalf("RunSettled logged %d rows, want exactly one: %#v", len(rows), rows)
	}
	got := rows[0]
	if got.Domain != want.Domain || got.Level != want.Level || got.EventType != want.EventType ||
		got.Message != want.Message || got.CorrelationID != "" {
		t.Fatalf("row = %#v, want domain/level/eventType/message %q/%q/%q/%q and no correlation id",
			got, want.Domain, want.Level, want.EventType, want.Message)
	}
	if !reflect.DeepEqual(got.Metadata, want.Metadata) {
		t.Fatalf("metadata = %#v, want %#v", got.Metadata, want.Metadata)
	}
}
