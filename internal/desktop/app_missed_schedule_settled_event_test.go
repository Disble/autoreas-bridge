package desktop

import (
	"context"
	"testing"

	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/schedule"
)

// TestMissedScheduleSettlementReachesTheFrontendFromTheNotificationCarrier is the regression this
// event exists for. Pressing "Run now"/"Ignore" on the persisted Center record settles the missed
// day in the backend, but the notification carrier has no return channel to the Downloads
// read-model the way the Wails binding does -- so the schedule panel and its persistent toast kept
// showing a day that was already settled. The settlement now reaches the frontend as a runtime
// event, exactly the way an archive and a navigation already do.
func TestMissedScheduleSettlementReachesTheFrontendFromTheNotificationCarrier(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{
		Kind:      schedule.MissedStartupActionSettled,
		LocalDate: "2026-07-26",
	}}
	app := &App{ctx: context.Background(), downloadScheduler: sched, emitFn: recorder.emit}

	handler, found := app.registerNotificationIntents().Resolve(center.IntentScheduleIgnoreMissed)
	if !found {
		t.Fatal("expected schedule.ignore_missed to be registered when a scheduler is wired")
	}
	if err := handler.Execute(context.Background(), map[string]string{"localDate": "2026-07-26"}); err != nil {
		t.Fatalf("expected the action token to settle without error, got %v", err)
	}

	if len(recorder.names) != 1 {
		t.Fatalf("emitted %#v, want exactly one runtime event for a settled missed day", recorder.names)
	}
	// Literals on both sides: the event name is a wire contract the frontend
	// subscribes to by string, so asserting against the production constant
	// would let a rename move both sides together and break nothing here while
	// breaking every renderer in the field.
	if recorder.names[0] != "schedule.missed_settled" {
		t.Fatalf("emitted event name = %q, want %q", recorder.names[0], "schedule.missed_settled")
	}
	if recorder.payload[0] != "2026-07-26" {
		t.Fatalf("emitted payload = %#v, want the settled local date %q", recorder.payload[0], "2026-07-26")
	}
}

// TestMissedScheduleSettlementCarriesTheSchedulerAnswerNotTheRequestedDate pins WHICH date travels.
// The scheduler owns what actually settled; the pressed token only carries what was asked for. A
// handler that forwarded its own argument would look identical in every other test here, because
// the two agree on every ordinary press.
func TestMissedScheduleSettlementCarriesTheSchedulerAnswerNotTheRequestedDate(t *testing.T) {
	t.Parallel()

	recorder := &emitRecorder{}
	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{
		Kind:      schedule.MissedStartupActionSettled,
		LocalDate: "2026-07-25",
	}}
	app := &App{ctx: context.Background(), downloadScheduler: sched, emitFn: recorder.emit}

	app.RunMissedScheduleNow("2026-07-26")

	if len(recorder.payload) != 1 {
		t.Fatalf("emitted %#v, want exactly one runtime event", recorder.names)
	}
	if recorder.payload[0] != "2026-07-25" {
		t.Fatalf("emitted payload = %#v, want the scheduler's settled date %q", recorder.payload[0], "2026-07-25")
	}
}

// TestMissedScheduleSettlementEmitsNothingWhenNothingSettled states the boundary this event does
// NOT cover. It reports what the operation DID, so only a settlement announces itself: a refused,
// racing or unavailable press changed no state and must not make every renderer re-read the
// schedule. A screen already stale before the press stays stale until its next ordinary refresh.
func TestMissedScheduleSettlementEmitsNothingWhenNothingSettled(t *testing.T) {
	t.Parallel()

	for _, kind := range []schedule.MissedStartupActionKind{
		schedule.MissedStartupActionAlreadyResolved,
		schedule.MissedStartupActionRunInProgress,
		schedule.MissedStartupActionNotAvailable,
		schedule.MissedStartupActionUnresolvedTerminal,
		schedule.MissedStartupActionError,
	} {
		t.Run(string(kind), func(t *testing.T) {
			t.Parallel()

			recorder := &emitRecorder{}
			sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: kind}}
			app := &App{ctx: context.Background(), downloadScheduler: sched, emitFn: recorder.emit}

			app.IgnoreMissedSchedule("2026-07-26")

			if len(recorder.names) != 0 {
				t.Fatalf("emitted %#v for a %q result, want nothing emitted", recorder.names, kind)
			}
		})
	}
}

// TestMissedScheduleSettlementStaysOptionalForTheOperation pins that the emit is a best-effort UI
// refresh, never part of the operation. Unlike navigation.open -- whose entire job IS the emit, and
// which is therefore left unregistered without one -- these two intents stay registered and still
// settle the day with no runtime attached, which is what a headless or pre-startup App is.
func TestMissedScheduleSettlementStaysOptionalForTheOperation(t *testing.T) {
	t.Parallel()

	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{
		Kind:      schedule.MissedStartupActionSettled,
		LocalDate: "2026-07-26",
	}}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	handler, found := app.registerNotificationIntents().Resolve(center.IntentScheduleRunMissedNow)
	if !found {
		t.Fatal("expected schedule.run_missed_now to stay registered without an emit channel")
	}
	if err := handler.Execute(context.Background(), map[string]string{"localDate": "2026-07-26"}); err != nil {
		t.Fatalf("expected the action to settle with no runtime attached, got %v", err)
	}

	if len(sched.resolveMissedCalls) != 1 {
		t.Fatalf("scheduler calls = %#v, want the operation to have run exactly once", sched.resolveMissedCalls)
	}
}
