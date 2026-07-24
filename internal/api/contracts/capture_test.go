package contracts

import "testing"

// TestCapturePageZeroValueIsNilSafe asserts CapturePage's zero value has a
// nil-safe Items slice and Degraded defaults to false (design.md "Schema
// tolerance": callers must be able to zero-construct a page and range over
// Items without a nil check).
func TestCapturePageZeroValueIsNilSafe(t *testing.T) {
	var page CapturePage
	if page.Items != nil {
		t.Fatalf("expected zero-value Items to be nil, got %#v", page.Items)
	}
	if page.Degraded {
		t.Fatal("expected zero-value Degraded to default false")
	}
	for range page.Items {
		t.Fatal("ranging over a nil Items slice must not panic or iterate")
	}
}

// TestCaptureRowFieldShapes asserts CaptureRow carries the fixed base
// projection fields with the pointer-optional HTTPStatus/DurationMS/AnimeID
// contract (design.md Interfaces/Contracts).
func TestCaptureRowFieldShapes(t *testing.T) {
	status := 200
	duration := int64(42)
	animeID := "anime-1"
	row := CaptureRow{
		RequestID:    "req-1",
		CapturedAtMS: 1000,
		Kind:         "patch",
		Route:        "/api/animes/anime-1",
		Transport:    "http",
		Outcome:      "accepted",
		ErrorCode:    "",
		HTTPStatus:   &status,
		DurationMS:   &duration,
		AnimeID:      &animeID,
	}
	if row.RequestID != "req-1" || *row.HTTPStatus != 200 || *row.DurationMS != 42 || *row.AnimeID != "anime-1" {
		t.Fatalf("unexpected CaptureRow shape: %#v", row)
	}
}

// TestCaptureQueryZeroValueHasNoFilters asserts a zero-value CaptureQuery
// carries no filters (Limit 0, all string filters empty, all pointer
// filters nil) so callers can compose it incrementally.
func TestCaptureQueryZeroValueHasNoFilters(t *testing.T) {
	var query CaptureQuery
	if query.Limit != 0 || query.Cursor != "" || query.Route != "" || query.Outcome != "" ||
		query.Kind != "" || query.AnimeID != "" || query.ErrorCode != "" {
		t.Fatalf("expected zero-value CaptureQuery to carry no filters, got %#v", query)
	}
	if query.HTTPStatus != nil || query.StartMS != nil || query.EndMS != nil {
		t.Fatalf("expected zero-value CaptureQuery pointer filters to be nil, got %#v", query)
	}
}

// TestCaptureDetailResultNotFoundDefaults asserts a zero-value
// CaptureDetailResult reports Found=false and Degraded=false, the "not
// found, not degraded" baseline GetCaptureTransaction returns for an
// unknown request id.
func TestCaptureDetailResultNotFoundDefaults(t *testing.T) {
	var result CaptureDetailResult
	if result.Found {
		t.Fatal("expected zero-value Found to default false")
	}
	if result.Degraded {
		t.Fatal("expected zero-value Degraded to default false")
	}
}
