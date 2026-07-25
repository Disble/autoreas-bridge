package requestcapture

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

func TestBuildTransportCaptureRecordIsTransportOnly(t *testing.T) {
	t.Parallel()

	record := BuildTransportCaptureRecord("req-1", 42, "patch", "/api/animes/anime-1", "http")
	if record.RequestID != "req-1" || record.CapturedAtMS != 42 {
		t.Fatalf("expected request id/captured_at_ms to be set verbatim, got %#v", record)
	}
	if record.Kind != "patch" || record.Route != "/api/animes/anime-1" || record.Transport != "http" {
		t.Fatalf("unexpected transport facts %#v", record)
	}
	if record.Outcome != "pending" {
		t.Fatalf("expected pending outcome for an arrival-shaped transport record, got %q", record.Outcome)
	}
	if record.Correlations.OperationRefs == nil {
		t.Fatal("expected a non-nil operation refs slice")
	}
}

func TestMergeEnrichmentOntoTransportRecord(t *testing.T) {
	t.Parallel()

	transport := BuildTransportCaptureRecord("req-1", 42, "patch", "/api/animes/anime-1", "http")
	status := 200
	transport.HTTPStatus = &status

	_, enr := NewEnrichmentContext(context.Background())
	enr.SetOutcome("accepted").SetAnimeID("anime-1").SetPayload(map[string]any{"status": 1})

	merged := MergeEnrichment(transport, enr)
	if merged.Outcome != "accepted" {
		t.Fatalf("expected enrichment outcome to override pending, got %q", merged.Outcome)
	}
	if merged.HTTPStatus == nil || *merged.HTTPStatus != 200 {
		t.Fatal("expected transport http status to survive the merge")
	}
	if merged.AnimeID == nil || *merged.AnimeID != "anime-1" {
		t.Fatalf("expected merged anime id, got %#v", merged.AnimeID)
	}
}

func TestMergeEnrichmentMissingLeavesTransportOnlyRecord(t *testing.T) {
	t.Parallel()

	transport := BuildTransportCaptureRecord("req-1", 42, "get", "/api/animes", "http")
	merged := MergeEnrichment(transport, Enrich(context.Background()))
	if merged.Outcome != "pending" {
		t.Fatalf("expected transport-only outcome to be preserved, got %q", merged.Outcome)
	}
}

func TestPatchPayloadParityWithRetiredBuilder(t *testing.T) {
	t.Parallel()

	estado := 2
	nroCapVisto := 10.5
	patch := contracts.AnimePatch{Estado: &estado, NroCapVisto: &nroCapVisto, Dias: []string{"mon", "tue"}}

	payload := PatchPayload(patch)
	if payload["status"] != 2 {
		t.Fatalf("expected sanitized status 2, got %#v", payload)
	}
	if payload["episodesWatched"] != 10.5 {
		t.Fatalf("expected sanitized episodesWatched 10.5, got %#v", payload)
	}
	if days, ok := payload["days"].([]string); !ok || len(days) != 2 {
		t.Fatalf("expected sanitized days slice, got %#v", payload["days"])
	}
}

func TestReconcilePayloadParityWithRetiredBuilder(t *testing.T) {
	t.Parallel()

	request := contracts.ReconcileRequest{
		LastChangelogID: 8,
		PendingOperations: []contracts.PendingOperation{
			{AnimeID: "anime-1", Operation: "update", CreatedAt: 1710000000123, Payload: map[string]any{"episodesWatched": float64(3)}},
		},
	}

	payload := ReconcilePayload(request)
	if payload["last_changelog_id"] != int64(8) {
		t.Fatalf("expected last_changelog_id 8, got %#v", payload["last_changelog_id"])
	}
	operations, ok := payload["pending_operations"].([]map[string]any)
	if !ok || len(operations) != 1 {
		t.Fatalf("expected one pending operation projection, got %#v", payload["pending_operations"])
	}
	if operations[0]["anime_id"] != "anime-1" {
		t.Fatalf("expected anime_id anime-1, got %#v", operations[0])
	}
}
