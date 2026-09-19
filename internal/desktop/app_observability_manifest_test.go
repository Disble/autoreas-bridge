package desktop

import (
	"context"
	"reflect"
	"strconv"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/observability/readcap"
	"autoreas-bridge/internal/observability/requestcapture"
)

// TestDesktopObservabilityManifestCoversCatalog pins the desktop declaration to
// the core catalog, with every intentional absence carrying a reason.
func TestDesktopObservabilityManifestCoversCatalog(t *testing.T) {
	t.Parallel()

	exposed := ObservabilityCapabilities()
	excluded := ObservabilityExcludedCapabilities()
	declared := make(map[string]struct{}, len(exposed)+len(excluded))
	for _, name := range exposed {
		if _, duplicate := declared[name]; duplicate {
			t.Fatalf("capability %q is exposed more than once", name)
		}
		declared[name] = struct{}{}
	}
	for name, reason := range excluded {
		if _, alsoExposed := declared[name]; alsoExposed {
			t.Fatalf("capability %q is both exposed and excluded", name)
		}
		if reason == "" {
			t.Fatalf("capability %q is excluded without a reason", name)
		}
		declared[name] = struct{}{}
	}

	catalog := readcap.Names()
	if len(declared) != len(catalog) {
		t.Fatalf("expected %d declared capabilities, got %#v", len(catalog), declared)
	}
	for _, name := range catalog {
		if _, found := declared[name]; !found {
			t.Fatalf("catalog capability %q is not declared", name)
		}
	}
}

// TestDesktopCaptureProjectionsPreserveCoreAnswers pins the desktop list, get,
// summary, and resolve bindings to the core reader over one temporary database.
func TestDesktopCaptureProjectionsPreserveCoreAnswers(t *testing.T) {
	t.Parallel()

	db := captureAppTestDB(t)
	seedCaptureRow(t, db, "req-1", 100)
	seedCaptureRow(t, db, "req-2", 200)
	seedCaptureRow(t, db, "req-3", 300)
	core := requestcapture.NewReader(db)
	app := &App{bridgeDB: db, captureReader: core}
	ctx := context.Background()

	corePage, err := core.Search(ctx, requestcapture.SearchParams{Limit: 10})
	if err != nil {
		t.Fatalf("core search: %v", err)
	}
	desktopPage := app.ListCaptureTransactions(contracts.CaptureQuery{Limit: 10})
	if got, want := desktopCaptureIDs(desktopPage.Items), coreCaptureIDs(corePage.Items); !reflect.DeepEqual(got, want) {
		t.Fatalf("search request ids differ: got %#v want %#v", got, want)
	}

	coreGet, err := core.Get(ctx, "req-2")
	if err != nil {
		t.Fatalf("core get: %v", err)
	}
	desktopGet := app.GetCaptureTransaction("req-2")
	if desktopGet.Found != coreGet.Found || desktopGet.Item.RequestID != coreGet.Item.RequestID {
		t.Fatalf("get result differs: got %#v want %#v", desktopGet, coreGet)
	}

	coreSummary, err := core.Summary(ctx, requestcapture.SearchFilters{})
	if err != nil {
		t.Fatalf("core summary: %v", err)
	}
	desktopSummary := app.SummarizeCaptureTransactions(contracts.CaptureSummaryQuery{})
	if got, want := desktopSummaryCounts(desktopSummary.Groups), coreSummaryCounts(coreSummary.Groups); !reflect.DeepEqual(got, want) {
		t.Fatalf("summary counts differ: got %#v want %#v", got, want)
	}

	coreCandidates, err := core.Resolve(ctx, "req-2")
	if err != nil {
		t.Fatalf("core resolve: %v", err)
	}
	desktopCandidates := app.ResolveCaptureTransactions("req-2")
	if desktopCandidates.Candidates == nil {
		t.Fatal("expected resolve candidates to be a non-nil slice")
	}
	if got, want := desktopResolveIDs(desktopCandidates.Candidates), coreResolveIDs(coreCandidates); !reflect.DeepEqual(got, want) {
		t.Fatalf("resolve candidates differ: got %#v want %#v", got, want)
	}

	if nilReaderResult := (&App{}).ResolveCaptureTransactions("req-2"); nilReaderResult.Candidates == nil || len(nilReaderResult.Candidates) != 0 {
		t.Fatalf("expected an unwired reader to return a non-nil empty result, got %#v", nilReaderResult)
	}
}

// desktopCaptureIDs returns desktop list request ids in their returned order.
func desktopCaptureIDs(items []contracts.CaptureRow) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.RequestID)
	}
	return ids
}

// coreCaptureIDs returns core list request ids in their returned order.
func coreCaptureIDs(items []requestcapture.CaptureRecord) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.RequestID)
	}
	return ids
}

// desktopResolveIDs returns desktop resolve request ids in their returned order.
func desktopResolveIDs(candidates []contracts.CaptureResolveCandidate) []string {
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.RequestID)
	}
	return ids
}

// coreResolveIDs returns core resolve request ids in their returned order.
func coreResolveIDs(candidates []requestcapture.ResolveCandidate) []string {
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.RequestID)
	}
	return ids
}

// desktopSummaryCounts reduces desktop summary groups to their grouping keys
// and counts.
func desktopSummaryCounts(groups []contracts.CaptureSummaryGroup) map[string]int {
	counts := make(map[string]int, len(groups))
	for _, group := range groups {
		counts[summaryCountKey(group.Route, group.HTTPStatus, group.Outcome)] = group.Count
	}
	return counts
}

// coreSummaryCounts reduces core summary groups to their grouping keys and
// counts.
func coreSummaryCounts(groups []requestcapture.SummaryGroup) map[string]int {
	counts := make(map[string]int, len(groups))
	for _, group := range groups {
		counts[summaryCountKey(group.Route, group.HTTPStatus, group.Outcome)] = group.Count
	}
	return counts
}

// summaryCountKey creates a comparable key for one route/status/outcome group.
func summaryCountKey(route string, status *int, outcome string) string {
	statusValue := "null"
	if status != nil {
		statusValue = strconv.Itoa(*status)
	}
	return route + "\x00" + statusValue + "\x00" + outcome
}
