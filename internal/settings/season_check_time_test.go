package settings_test

import (
	"context"
	"testing"
)

// TestSeasonCheckTimeIsEmptyWhenUnsetThenRoundTrips reads the unset check time
// as empty, then persists one and reads it back.
func TestSeasonCheckTimeIsEmptyWhenUnsetThenRoundTrips(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	got, err := store.SeasonCheckTime(ctx)
	if err != nil {
		t.Fatalf("SeasonCheckTime: %v", err)
	}
	if got != "" {
		t.Fatalf("unset season check time = %q, want empty", got)
	}

	if err := store.SetSeasonCheckTime(ctx, "07:30"); err != nil {
		t.Fatalf("SetSeasonCheckTime: %v", err)
	}
	got, err = store.SeasonCheckTime(ctx)
	if err != nil {
		t.Fatalf("SeasonCheckTime: %v", err)
	}
	if got != "07:30" {
		t.Fatalf("season check time = %q, want %q", got, "07:30")
	}
}
