package download

import (
	"context"
	"testing"
	"time"
)

// TestFinalizeContextSurvivesACancelledRun is the guarantee the terminal row rests on: the write
// that records how a run ended must land even when the run ended by being cancelled. Writing it
// through the run's own context fails, leaving the row "running" until the next startup reconcile
// relabels it "interrupted" -- exactly the state a user-pressed Stop must never produce.
func TestFinalizeContextSurvivesACancelledRun(t *testing.T) {
	t.Parallel()

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	finalizeCtx, release := finalizeContext(cancelled)
	defer release()

	if finalizeCtx.Err() != nil {
		t.Fatalf("finalize context is already done (%v); the terminal row would never be written", finalizeCtx.Err())
	}
}

// TestFinalizeContextIsBounded is the other half: detaching from cancellation must not mean
// waiting forever, or a hung store keeps a cancelled run alive indefinitely.
//
// The window is written as literals rather than derived from finalizeTimeout: asserting against
// the very constant under test would pass for any value it was given (CLAUDE.md #16).
func TestFinalizeContextIsBounded(t *testing.T) {
	t.Parallel()

	finalizeCtx, release := finalizeContext(context.Background())
	defer release()

	deadline, ok := finalizeCtx.Deadline()
	if !ok {
		t.Fatal("finalize context carries no deadline; a hung store would keep a cancelled run alive")
	}

	remaining := time.Until(deadline)
	if remaining < 4500*time.Millisecond || remaining > 5500*time.Millisecond {
		t.Fatalf("finalize deadline is %v away, want about 5s -- long enough for a slow store, short enough to give up", remaining)
	}
}
