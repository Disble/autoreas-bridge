package mobilecapture

import (
	"context"
	"testing"
)

func TestSummaryCountsPerRouteStatusOutcome(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	summary, err := reader.Summary(context.Background(), SearchFilters{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if len(summary.Groups) == 0 {
		t.Fatal("expected at least one group")
	}
	var total int
	for _, group := range summary.Groups {
		total += group.Count
	}
	if total != 3 {
		t.Fatalf("expected 3 total captures across groups, got %d", total)
	}
}

func TestSummaryLatestErrorSamplesBounded(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	for index := 1; index <= 8; index++ {
		record := NewCaptureRecord("patch", "device-1")
		record.RequestID = requestIDFor("err", index)
		record.CapturedAtMS = int64(index)
		record.Route = "/api/animes/anime-1"
		record.Outcome = "rejected"
		record.ErrorCode = "anime_not_found"
		record.HTTPStatus = intRef(404)
		if err := store.InsertCapture(context.Background(), record); err != nil {
			t.Fatalf("seed error sample %d: %v", index, err)
		}
	}

	reader := NewReader(db)
	summary, err := reader.Summary(context.Background(), SearchFilters{})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	if len(summary.Groups) != 1 {
		t.Fatalf("expected one group, got %#v", summary.Groups)
	}
	group := summary.Groups[0]
	if group.Count != 8 {
		t.Fatalf("expected count 8, got %d", group.Count)
	}
	if len(group.LatestErrorSamples) > 5 {
		t.Fatalf("expected at most 5 error samples, got %d", len(group.LatestErrorSamples))
	}
	if len(group.LatestErrorSamples) == 0 {
		t.Fatal("expected at least one error sample")
	}
	if group.LatestErrorSamples[0].RequestID != requestIDFor("err", 8) {
		t.Fatalf("expected newest sample first, got %#v", group.LatestErrorSamples[0])
	}
}

func TestSummaryScopedByFilters(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})
	seedSearchFixtures(t, store)

	reader := NewReader(db)
	summary, err := reader.Summary(context.Background(), SearchFilters{Route: "/api/sync/reconcile", StartMS: int64Ref(200)})
	if err != nil {
		t.Fatalf("summary: %v", err)
	}
	var total int
	for _, group := range summary.Groups {
		total += group.Count
	}
	if total != 1 {
		t.Fatalf("expected scoped summary to count only req-reconcile-400, got %d", total)
	}
}

func TestSummaryEmptyZeroed(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	reader := NewReader(db)
	summary, err := reader.Summary(context.Background(), SearchFilters{Route: "/api/does-not-exist"})
	if err != nil {
		t.Fatalf("expected no error for empty summary, got %v", err)
	}
	if len(summary.Groups) != 0 {
		t.Fatalf("expected zeroed/empty summary groups, got %#v", summary.Groups)
	}
}

// requestIDFor returns a deterministic multi-digit request id for the given prefix/index.
func requestIDFor(prefix string, index int) string {
	digits := "0123456789"
	return prefix + "-" + string(digits[index%10])
}
