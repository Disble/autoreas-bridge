package main

import (
	"context"
	"reflect"
	"testing"

	"autoreas-bridge/internal/download"
	"autoreas-bridge/internal/notification/center"
	"autoreas-bridge/internal/schedule"
)

// TestRegisterNotificationIntentsDownloadRunAnimeConditionalOnDownloadService
// asserts download.run_anime is registered only when a.downloadService is
// wired (design Decision C).
func TestRegisterNotificationIntentsDownloadRunAnimeConditionalOnDownloadService(t *testing.T) {
	t.Parallel()

	absent := &App{}
	if _, found := absent.registerNotificationIntents().Resolve(center.IntentDownloadRunAnime); found {
		t.Fatal("expected download.run_anime absent when downloadService is nil")
	}

	present := &App{downloadService: download.NewService(download.ServiceDeps{})}
	if _, found := present.registerNotificationIntents().Resolve(center.IntentDownloadRunAnime); !found {
		t.Fatal("expected download.run_anime present when downloadService is wired")
	}
}

// TestRegisterNotificationIntentsScheduleIntentsConditionalOnDownloadScheduler
// asserts schedule.run_missed_now/schedule.ignore_missed are registered
// only when a.downloadScheduler is wired (design Decision C).
func TestRegisterNotificationIntentsScheduleIntentsConditionalOnDownloadScheduler(t *testing.T) {
	t.Parallel()

	absent := &App{}
	registry := absent.registerNotificationIntents()
	if _, found := registry.Resolve(center.IntentScheduleRunMissedNow); found {
		t.Fatal("expected schedule.run_missed_now absent when downloadScheduler is nil")
	}
	if _, found := registry.Resolve(center.IntentScheduleIgnoreMissed); found {
		t.Fatal("expected schedule.ignore_missed absent when downloadScheduler is nil")
	}

	present := &App{downloadScheduler: &fakeAppScheduler{}}
	registry = present.registerNotificationIntents()
	if _, found := registry.Resolve(center.IntentScheduleRunMissedNow); !found {
		t.Fatal("expected schedule.run_missed_now present when downloadScheduler is wired")
	}
	if _, found := registry.Resolve(center.IntentScheduleIgnoreMissed); !found {
		t.Fatal("expected schedule.ignore_missed present when downloadScheduler is wired")
	}
}

// TestRegisterNotificationIntentsNeverRegistersDownloadRetryRun asserts
// download.retry_run is never registered, regardless of which subsystems
// are wired -- it does not exist (internal/download/service.go exposes
// only RunOnce and RunAnime).
func TestRegisterNotificationIntentsNeverRegistersDownloadRetryRun(t *testing.T) {
	t.Parallel()

	app := &App{downloadService: download.NewService(download.ServiceDeps{}), downloadScheduler: &fakeAppScheduler{}}
	registry := app.registerNotificationIntents()

	for _, key := range registry.Keys() {
		if key == "download.retry_run" {
			t.Fatal("expected download.retry_run to never be registered")
		}
	}
}

// TestRunMissedScheduleNowAndEquivalentActionTokenInvokeSameHandler asserts
// a shared spy scheduler observes IDENTICAL calls whether triggered via the
// pre-existing RunMissedScheduleNow Wails binding, or via the equivalent
// registered schedule.run_missed_now action token -- both carriers converge
// on resolveMissedStartupAction (app_download.go), never a rival second path
// (notification-actions spec, "Existing Wails Bindings Become Carriers Of
// Registered Intents").
func TestRunMissedScheduleNowAndEquivalentActionTokenInvokeSameHandler(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: schedule.MissedStartupActionSettled, LocalDate: "2026-07-26"}}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	viaBinding := app.RunMissedScheduleNow("2026-07-26")
	if viaBinding.Kind != string(schedule.MissedStartupActionSettled) {
		t.Fatalf("expected the pre-existing binding to settle, got %#v", viaBinding)
	}

	registry := app.registerNotificationIntents()
	handler, found := registry.Resolve(center.IntentScheduleRunMissedNow)
	if !found {
		t.Fatal("expected schedule.run_missed_now to be registered when a scheduler is wired")
	}
	if err := handler.Execute(context.Background(), map[string]string{"localDate": "2026-07-26"}); err != nil {
		t.Fatalf("expected the equivalent action token to settle without error, got %v", err)
	}

	want := []string{"run_now:2026-07-26", "run_now:2026-07-26"}
	if !reflect.DeepEqual(sched.resolveMissedCalls, want) {
		t.Fatalf("expected both carriers to invoke the exact same scheduler operation with equivalent args, got %#v", sched.resolveMissedCalls)
	}
}

// TestIgnoreMissedScheduleAndEquivalentActionTokenInvokeSameHandler mirrors
// the Run-now case for schedule.ignore_missed/IgnoreMissedSchedule.
func TestIgnoreMissedScheduleAndEquivalentActionTokenInvokeSameHandler(t *testing.T) {
	t.Parallel()
	sched := &fakeAppScheduler{resolveMissedResult: schedule.MissedStartupActionResult{Kind: schedule.MissedStartupActionSettled, LocalDate: "2026-07-26"}}
	app := &App{ctx: context.Background(), downloadScheduler: sched}

	viaBinding := app.IgnoreMissedSchedule("2026-07-26")
	if viaBinding.Kind != string(schedule.MissedStartupActionSettled) {
		t.Fatalf("expected the pre-existing binding to settle, got %#v", viaBinding)
	}

	registry := app.registerNotificationIntents()
	handler, found := registry.Resolve(center.IntentScheduleIgnoreMissed)
	if !found {
		t.Fatal("expected schedule.ignore_missed to be registered when a scheduler is wired")
	}
	if err := handler.Execute(context.Background(), map[string]string{"localDate": "2026-07-26"}); err != nil {
		t.Fatalf("expected the equivalent action token to settle without error, got %v", err)
	}

	want := []string{"ignore:2026-07-26", "ignore:2026-07-26"}
	if !reflect.DeepEqual(sched.resolveMissedCalls, want) {
		t.Fatalf("expected both carriers to invoke the exact same scheduler operation with equivalent args, got %#v", sched.resolveMissedCalls)
	}
}
