package myanimelist

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

// liveStableMalID is a long-finished, exceptionally stable anime page
// (Cowboy Bebop) chosen so its Information block's markup shape is
// unlikely to change — the one property this probe needs. Its score,
// rank and member counts are expected to keep changing and are never
// asserted (design D3).
const liveStableMalID = 1

// TestLiveDetailFetchHasNoDriftAgainstTheRealSite is design D3's opt-in
// live probe: gated on MYANIMELIST_LIVE=1 via t.Skip, never a build tag,
// so it always compiles and go test ./... always sees it (Task-Planning
// Note F). It asserts ONLY that every required anchor is present and the
// parse returns no *DriftError — never a specific value, because score,
// rank and members change hourly and pinning them would be flaky for a
// reason that is not drift.
func TestLiveDetailFetchHasNoDriftAgainstTheRealSite(t *testing.T) {
	if os.Getenv("MYANIMELIST_LIVE") != "1" {
		t.Skip("set MYANIMELIST_LIVE=1 to run this probe against the real MyAnimeList site")
	}

	client := NewClient(NewHTTPClient(10*time.Second, 1<<20, "autoreas-bridge/live-probe"), "")

	detail, err := client.Detail(context.Background(), liveStableMalID)

	var driftErr *DriftError
	if errors.As(err, &driftErr) {
		t.Fatalf("expected no markup drift against the real site, got %v", driftErr)
	}
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if detail.Title == "" {
		t.Fatal("expected a non-empty title heading")
	}
	if detail.Type == "" {
		t.Fatal("expected a non-empty Type: value")
	}
}
