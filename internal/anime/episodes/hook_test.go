package episodes_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime/episodes"
)

// TestOnPendingMarkedRunsOnlyAfterAWriteThatMarked proves the announcer wake-up: it runs once per
// committed write that changed a row, never for a write that changed nothing, and never on the
// store it was copied from.
func TestOnPendingMarkedRunsOnlyAfterAWriteThatMarked(t *testing.T) {
	ctx := context.Background()
	plain, _ := openTestStore(t)
	calls := 0
	hooked := plain.OnPendingMarked(func() { calls++ })

	_, err := hooked.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 1000}})
	must(t, err)
	if calls != 1 {
		t.Fatalf("a write that marked must wake once, got %d", calls)
	}

	_, err = hooked.FillGaps(ctx, "a", []episodes.Reading{{Episode: 1, DurationMS: 2000}})
	must(t, err)
	if calls != 1 {
		t.Fatalf("a write that changed nothing must not wake, got %d", calls)
	}

	must(t, plain.SetManual(ctx, "a", 2, 3000))
	if calls != 1 {
		t.Fatalf("the original store must stay unhooked, got %d", calls)
	}

	must(t, hooked.Clear(ctx, "a", 2))
	if calls != 2 {
		t.Fatalf("a clear that deleted a row must wake, got %d", calls)
	}
}

// TestOnPendingMarkedDoesNotRunForAFailedWrite proves the wake-up follows the commit, not the attempt.
func TestOnPendingMarkedDoesNotRunForAFailedWrite(t *testing.T) {
	ctx := context.Background()
	plain, _ := openTestStore(t)
	calls := 0
	hooked := plain.OnPendingMarked(func() { calls++ })

	if err := hooked.SetManual(ctx, "a", 0, 1000); err == nil {
		t.Fatal("episode 0 must be refused")
	}
	if calls != 0 {
		t.Fatalf("a refused write must not wake, got %d", calls)
	}
}
