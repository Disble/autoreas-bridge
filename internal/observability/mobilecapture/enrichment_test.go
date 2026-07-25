package mobilecapture

import (
	"context"
	"testing"

	"autoreas-bridge/internal/device"
)

func TestNewEnrichmentContextRoundTrips(t *testing.T) {
	t.Parallel()

	ctx, enr := NewEnrichmentContext(context.Background())
	if enr == nil {
		t.Fatal("expected a non-nil enrichment holder")
	}

	got := Enrich(ctx)
	if got != enr {
		t.Fatalf("expected Enrich(ctx) to return the same holder installed by NewEnrichmentContext, got %#v vs %#v", got, enr)
	}
}

func TestEnrichOffMiddlewareReturnsSafeNoOpHolder(t *testing.T) {
	t.Parallel()

	enr := Enrich(context.Background())
	if enr == nil {
		t.Fatal("expected Enrich to never return nil off-middleware")
	}
	// Chaining setters on the no-op holder must not panic.
	enr.SetOutcome("accepted").SetErrorCode("").SetAnimeID("anime-1").AddConflictID("conflict-1")
}

func TestEnrichmentSettersAccumulateAndChain(t *testing.T) {
	t.Parallel()

	_, enr := NewEnrichmentContext(context.Background())
	result := enr.
		SetOutcome("accepted").
		SetDevice(device.PairedDevice{DeviceID: "device-1", Name: "Phone"}).
		SetAnimeID("anime-1").
		SetErrorCode("").
		SetPayload(map[string]any{"status": 1}).
		AddConflictID("conflict-1").
		AddConflictID("conflict-2").
		AddChangelogIDs(10, 11).
		SetOperationRefs([]OperationRef{{AnimeID: "anime-1", Operation: "update", Outcome: "applied"}})

	if result != enr {
		t.Fatal("expected setters to return the same holder for chaining")
	}

	record := MergeEnrichment(CaptureRecord{}, enr)
	if record.Outcome != "accepted" {
		t.Fatalf("expected outcome accepted, got %q", record.Outcome)
	}
	if record.Device.DeviceID != "device-1" {
		t.Fatalf("expected device id device-1, got %q", record.Device.DeviceID)
	}
	if record.AnimeID == nil || *record.AnimeID != "anime-1" {
		t.Fatalf("expected anime id anime-1, got %#v", record.AnimeID)
	}
	if record.Payload["status"] != 1 {
		t.Fatalf("expected payload status 1, got %#v", record.Payload)
	}
	if got := record.Correlations.ConflictIDs; len(got) != 2 || got[0] != "conflict-1" || got[1] != "conflict-2" {
		t.Fatalf("expected accumulated conflict ids, got %#v", got)
	}
	if got := record.Correlations.ChangelogIDs; len(got) != 2 || got[0] != 10 || got[1] != 11 {
		t.Fatalf("expected accumulated changelog ids, got %#v", got)
	}
	if got := record.Correlations.OperationRefs; len(got) != 1 || got[0].AnimeID != "anime-1" {
		t.Fatalf("expected operation refs, got %#v", got)
	}
}

func TestMergeEnrichmentLeavesTransportOnlyRecordWhenNeverSet(t *testing.T) {
	t.Parallel()

	transport := CaptureRecord{RequestID: "req-1", Outcome: "pending"}
	merged := MergeEnrichment(transport, Enrich(context.Background()))
	if merged.Outcome != "pending" {
		t.Fatalf("expected transport-only outcome to survive an unset enrichment holder, got %q", merged.Outcome)
	}
	if merged.AnimeID != nil {
		t.Fatalf("expected no anime id from an unset enrichment holder, got %#v", merged.AnimeID)
	}
}
