package desktop

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/download"
	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/schedule"
)

// missedScheduleApp builds an App whose schedule config describes a selected day that came due
// at 21:00 while Bridge was closed, and whose process only started at 21:05 -- exactly the
// startup shape EvaluateStartupMissedSelectedDay reports a missed notice for.
func missedScheduleApp(notifier *recordingAppNotifier) *App {
	return &App{
		ctx:      context.Background(),
		notifier: notifier,
		downloadStore: &fakeAppDownloadStore{
			scheduleConfig: download.ScheduleConfig{
				Mode:            "in_process",
				DailyTimeHHMM:   "21:00",
				Enabled:         true,
				EnabledWeekdays: 1 << time.Sunday,
			},
		},
		nowTime:          func() time.Time { return time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC) },
		processStartedAt: time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC),
	}
}

// TestNotifyMissedScheduleWritesARecordCarryingBothActions closes the gap the design canvas
// states as a governing rule: "A toast the user cannot find again is worse than no toast."
// The missed-schedule toast was synthesized entirely in the frontend, so no record was ever
// written and the notification could not be found once the toast was gone. Raising it through
// the Go Notifier makes it a durable record whose two buttons still resolve days later.
func TestNotifyMissedScheduleWritesARecordCarryingBothActions(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)

	app.notifyMissedSchedule(context.Background())

	if len(notifier.received) != 1 {
		t.Fatalf("received %d notifications, want 1", len(notifier.received))
	}
	got := notifier.received[0]
	if got.Kind != "missed_schedule" {
		t.Fatalf("Kind = %q, want %q", got.Kind, "missed_schedule")
	}
	if got.Source != "schedule" {
		t.Fatalf("Source = %q, want %q", got.Source, "schedule")
	}
	if got.Body == "" || got.Title == "" {
		t.Fatalf("notification = %#v, want a title and a body saying which day was missed", got)
	}
	if len(got.Actions) != 2 {
		t.Fatalf("Actions = %#v, want exactly the two the artboard draws", got.Actions)
	}
	if got.Actions[0].Intent != "schedule.run_missed_now" {
		t.Fatalf("Actions[0].Intent = %q, want %q", got.Actions[0].Intent, "schedule.run_missed_now")
	}
	if got.Actions[1].Intent != "schedule.ignore_missed" {
		t.Fatalf("Actions[1].Intent = %q, want %q", got.Actions[1].Intent, "schedule.ignore_missed")
	}
	for i, action := range got.Actions {
		if action.Label == "" {
			t.Fatalf("Actions[%d] = %#v, want a label a button can render", i, action)
		}
		if action.RowRef != "" {
			t.Fatalf("Actions[%d].RowRef = %q, want empty -- a blockless kind has no row to bind to", i, action.RowRef)
		}
		if action.Args["localDate"] != "2026-07-26" {
			t.Fatalf("Actions[%d].Args = %#v, want the missed local date frozen at creation", i, action.Args)
		}
	}
}

// TestNotifyMissedScheduleFreezesArgsPerActionRatherThanSharingOneMap pins that the two actions
// do not share one Args map. A shared literal would let one action's frozen arguments be
// rewritten through the other's -- precisely the immutability the token pattern exists to
// provide (runWideActions makes the same call for the same reason).
func TestNotifyMissedScheduleFreezesArgsPerActionRatherThanSharingOneMap(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)

	app.notifyMissedSchedule(context.Background())

	actions := notifier.received[0].Actions
	actions[0].Args["localDate"] = "rewritten"
	if actions[1].Args["localDate"] != "2026-07-26" {
		t.Fatalf("Actions[1].Args = %#v, want it untouched by a write through Actions[0]", actions[1].Args)
	}
}

// TestNotifyMissedScheduleStaysSilentWhenNothingWasMissed pins the negative case: a process that
// started BEFORE the due boundary did not miss anything, and must not write a record that would
// then sit unread in the Center forever.
func TestNotifyMissedScheduleStaysSilentWhenNothingWasMissed(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)
	app.processStartedAt = time.Date(2026, 7, 26, 20, 0, 0, 0, time.UTC)

	app.notifyMissedSchedule(context.Background())

	if len(notifier.received) != 0 {
		t.Fatalf("received %#v, want no notification when the schedule was not missed", notifier.received)
	}
}

// TestNotifyMissedScheduleDegradesWhenTheStoreIsUnavailable pins that a bridge DB that never
// came up leaves the producer silent rather than panicking through a nil store, matching every
// other app-level producer's nil tolerance.
func TestNotifyMissedScheduleDegradesWhenTheStoreIsUnavailable(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)
	app.downloadStore = nil

	app.notifyMissedSchedule(context.Background())

	if len(notifier.received) != 0 {
		t.Fatalf("received %#v, want no notification without a schedule to read", notifier.received)
	}

	silent := missedScheduleApp(&recordingAppNotifier{})
	silent.notifier = nil
	silent.notifyMissedSchedule(context.Background())
}

// TestMissedScheduleActionArgsResolveThroughTheRegisteredIntents is the two-sided proof the
// frozen-arg key actually round-trips: the producer freezes it, and the handler
// registerNotificationIntents registered reads it back. A typo on either side would otherwise
// produce an action that resolves to a handler and then acts on an empty date.
func TestMissedScheduleActionArgsResolveThroughTheRegisteredIntents(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)
	scheduler := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: schedule.MissedStartupActionSettled}}
	app.downloadScheduler = scheduler

	app.notifyMissedSchedule(context.Background())
	registry := app.registerNotificationIntents()

	for _, action := range notifier.received[0].Actions {
		handler, found := registry.Resolve(action.Intent)
		if !found {
			t.Fatalf("intent %q is not registered, so its token can never fire", action.Intent)
		}
		if err := handler.Execute(context.Background(), action.Args); err != nil {
			t.Fatalf("executing %q returned %v, want the frozen args to settle it", action.Intent, err)
		}
	}

	want := []string{"run_now:2026-07-26", "ignore:2026-07-26"}
	if len(scheduler.resolveMissedCalls) != len(want) {
		t.Fatalf("scheduler calls = %#v, want %#v", scheduler.resolveMissedCalls, want)
	}
	for i, call := range scheduler.resolveMissedCalls {
		if call != want[i] {
			t.Fatalf("scheduler call %d = %q, want %q", i, call, want[i])
		}
	}
}

// TestStartupRaisesTheMissedScheduleRecord pins the wiring, not just the producer. The record is
// one-shot and startup is its only firing moment, so a producer nobody calls is indistinguishable
// from the gap it was written to close.
func TestStartupRaisesTheMissedScheduleRecord(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := newAppTestApp(t)
	app.newNotifier = func(func(context.Context, string, ...any), ...sharedlogger.Logger) notification.Notifier {
		return notifier
	}
	app.newDownloadStore = func(*sql.DB) download.Store {
		return &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{
			Mode:            "in_process",
			DailyTimeHHMM:   "21:00",
			Enabled:         true,
			EnabledWeekdays: 1 << time.Sunday,
		}}
	}
	app.nowTime = func() time.Time { return time.Date(2026, 7, 26, 21, 30, 0, 0, time.UTC) }
	app.processStartedAt = time.Date(2026, 7, 26, 21, 5, 0, 0, time.UTC)

	app.startup(context.Background())

	found := false
	for _, got := range notifier.received {
		if got.Kind == "missed_schedule" {
			found = true
		}
	}
	if !found {
		t.Fatalf("startup raised %#v, want one of them to be the missed-schedule record", notifier.received)
	}
}

// erroringScheduleStore is a download.Store whose schedule read fails, so the producer's error
// branch is reachable at all. fakeAppDownloadStore always succeeds, which would leave that branch
// unprovable -- and a guard no test can distinguish from its own inverse is indistinguishable
// from protection that has quietly stopped working.
type erroringScheduleStore struct{ *fakeAppDownloadStore }

func (erroringScheduleStore) GetScheduleConfig(context.Context) (download.ScheduleConfig, error) {
	return download.ScheduleConfig{}, errors.New("schedule read failed")
}

// TestNotifyMissedScheduleStaysSilentWhenTheScheduleCannotBeRead pins that an unreadable schedule
// produces nothing rather than a notification asserting a day was missed on no evidence.
func TestNotifyMissedScheduleStaysSilentWhenTheScheduleCannotBeRead(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)
	app.downloadStore = erroringScheduleStore{&fakeAppDownloadStore{}}

	app.notifyMissedSchedule(context.Background())

	if len(notifier.received) != 0 {
		t.Fatalf("received %#v, want no notification when the schedule could not be read", notifier.received)
	}
}

// TestNotifyMissedScheduleBodyReportsAPreviousFailedAttempt pins the second half of the body: when
// a "Run now" already ran for this date and did not settle it, the record says so, instead of
// reading as though nothing had been tried.
func TestNotifyMissedScheduleBodyReportsAPreviousFailedAttempt(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)
	app.downloadStore = &fakeAppDownloadStore{scheduleConfig: download.ScheduleConfig{
		Mode:                    "in_process",
		DailyTimeHHMM:           "21:00",
		Enabled:                 true,
		EnabledWeekdays:         1 << time.Sunday,
		LastMissedAttemptDate:   "2026-07-26",
		LastMissedAttemptStatus: "error",
	}}

	app.notifyMissedSchedule(context.Background())

	body := notifier.received[0].Body
	if !strings.Contains(body, "error") {
		t.Fatalf("Body = %q, want it to report the previous attempt's outcome", body)
	}
	if !strings.Contains(body, "2026-07-26") {
		t.Fatalf("Body = %q, want it to name the missed day", body)
	}
}

// TestNotifyMissedScheduleBodyOmitsAnAttemptThatNeverHappened is the other side of that branch: a
// day nobody has tried yet must not grow a sentence about an attempt with an empty outcome.
func TestNotifyMissedScheduleBodyOmitsAnAttemptThatNeverHappened(t *testing.T) {
	t.Parallel()

	notifier := &recordingAppNotifier{}
	app := missedScheduleApp(notifier)

	app.notifyMissedSchedule(context.Background())

	if body := notifier.received[0].Body; strings.Contains(body, "last attempt") || strings.Contains(body, "The last attempt") {
		t.Fatalf("Body = %q, want no attempt sentence when nothing has been attempted", body)
	}
}
