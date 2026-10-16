package settings_test

import (
	"context"
	"testing"
)

func TestSeasonCheckTimeIsEmptyWhenUnset(t *testing.T) {
	store := newTestStore(t)
	got, err := store.SeasonCheckTime(context.Background())
	if err != nil {
		t.Fatalf("SeasonCheckTime: %v", err)
	}
	if got != "" {
		t.Fatalf("unset season check time = %q, want empty", got)
	}
}

func TestSetSeasonCheckTimeRoundTrips(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	if err := store.SetSeasonCheckTime(ctx, "07:30"); err != nil {
		t.Fatalf("SetSeasonCheckTime: %v", err)
	}
	got, err := store.SeasonCheckTime(ctx)
	if err != nil {
		t.Fatalf("SeasonCheckTime: %v", err)
	}
	if got != "07:30" {
		t.Fatalf("season check time = %q, want %q", got, "07:30")
	}
}
