package main

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/notification"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/schedule"
)

const (
	// missedScheduleSource is the bounded context this notification is raised from. The
	// scheduler owns the missed-day decision (internal/schedule), which is also where both of
	// the action tokens' intents are namespaced -- "schedule.run_missed_now" and
	// "schedule.ignore_missed". The Center's source filter reads its options out of the data
	// rather than from a hardcoded list, so a new source needs no frontend change.
	missedScheduleSource = "schedule"
	// missedScheduleTitle matches the copy the frontend toast already shows for this event, so
	// the record a user opens days later reads the same as the toast that interrupted them.
	missedScheduleTitle = "Missed selected day"
	// missedScheduleRunNowLabel and missedScheduleIgnoreLabel are the two buttons the design
	// canvas draws on this notification.
	missedScheduleRunNowLabel = "Run now"
	missedScheduleIgnoreLabel = "Ignore"
	// missedScheduleLocalDateArgKey is where both missed-schedule intents read the day they act
	// on. It is deliberately NOT declared in internal/notification/center: that file holds the
	// keys a producer in ANOTHER package must agree on with the composition root, and this
	// producer lives in package main beside the handlers that read it
	// (registerNotificationIntents). The two sides are instead pinned together by an executable
	// test that freezes a token here and fires it through the live registry.
	missedScheduleLocalDateArgKey = "localDate"
)

// notifyMissedSchedule raises the one-shot record for a selected day whose scheduled download
// never ran because Bridge was closed when it came due.
//
// This closes the gap the design canvas states as its first governing rule -- "Persist before
// you interrupt: a toast the user cannot find again is worse than no toast." The missed-schedule
// toast used to be synthesized entirely in the frontend resolver, pushed straight into the local
// toast queue, so nothing was ever written: once the toast was gone the notification could not
// be found again, and its two buttons went with it.
//
// It is raised exactly once, at startup, because that is the only moment the notice can begin to
// exist: EvaluateStartupMissedSelectedDay requires ProcessStartedAt to be after the due
// boundary, which no later evaluation during the same process can newly satisfy. A notice can
// only stop being true afterwards (once the day is settled), never start.
func (a *App) notifyMissedSchedule(ctx context.Context) {
	if a.notifier == nil {
		return
	}
	notice := a.evaluateStartupMissedSchedule(ctx)
	if notice == nil {
		return
	}
	_ = a.notifier.Notify(ctx, notification.Notification{
		Title:     missedScheduleTitle,
		Body:      missedScheduleBody(notice),
		Level:     notification.LevelWarning,
		Source:    missedScheduleSource,
		Kind:      missedScheduleKind,
		Timestamp: time.Now(),
		Actions:   missedScheduleActions(notice.LocalDate),
	})
}

// evaluateStartupMissedSchedule reads the persisted schedule and asks the scheduler's pure
// evaluator whether this startup crossed an unresolved due boundary. A bridge DB that never came
// up, or a schedule that cannot be read, degrades to "nothing was missed" rather than to a
// notification nobody can act on.
func (a *App) evaluateStartupMissedSchedule(ctx context.Context) *schedule.StartupMissedSelectedDayNotice {
	if a.downloadStore == nil {
		return nil
	}
	cfg, err := a.downloadStore.GetScheduleConfig(ctx)
	if err != nil {
		return nil
	}
	return schedule.EvaluateStartupMissedSelectedDay(schedule.StartupMissedSelectedDayInput{
		Now:              a.currentTime(),
		ProcessStartedAt: a.processStartedAt,
		Config:           cfg,
	})
}

// missedScheduleBody states which day was missed and, when a previous "Run now" already failed
// for it, what that attempt ended as -- the same two facts the frontend notice carries.
func missedScheduleBody(notice *schedule.StartupMissedSelectedDayNotice) string {
	body := fmt.Sprintf("The scheduled download for %s did not run: it came due while Bridge was closed.", notice.LocalDate)
	if notice.AttemptStatus != "" {
		return fmt.Sprintf("%s The last attempt finished with %q.", body, notice.AttemptStatus)
	}
	return body
}

// missedScheduleActions returns the two tokens this notification carries, each freezing the
// missed local date at creation.
//
// Built per call rather than shared, and with one Args map per action rather than one between
// them, because an ActionSpec's Args map is mutable: a shared literal would let one
// notification's -- or one action's -- frozen arguments be rewritten through another's, which is
// exactly the immutability the token pattern exists to provide (runWideActions is built this way
// for the same reason).
func missedScheduleActions(localDate string) []notification.ActionSpec {
	return []notification.ActionSpec{
		{
			Label:  missedScheduleRunNowLabel,
			Intent: center.IntentScheduleRunMissedNow,
			Args:   map[string]string{missedScheduleLocalDateArgKey: localDate},
		},
		{
			Label:  missedScheduleIgnoreLabel,
			Intent: center.IntentScheduleIgnoreMissed,
			Args:   map[string]string{missedScheduleLocalDateArgKey: localDate},
		},
	}
}
