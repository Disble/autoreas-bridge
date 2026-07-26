package requestcapture

import (
	"context"
	"testing"
)

func TestUpsertCaptureKeepsTerminalStateWhenArrivalWritesAfterIt(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	terminal := BuildTransportCaptureRecord("req-reverse-order", 100, "patch", "/api/animes/anime-1", "http")
	terminal.Outcome = "accepted"
	status := 200
	terminal.HTTPStatus = &status
	duration := int64(42)
	terminal.DurationMS = &duration
	requestBody := `{"name":"x"}`
	terminal.RequestBody = &requestBody
	terminal.RequestBodyState = CaptureStateOmittedTooLarge
	responseBody := `{"ok":true}`
	terminal.ResponseBody = &responseBody
	terminal.ResponseBodyState = CaptureStateTruncated
	terminal.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	terminal.ResponseHeaders = map[string]string{"X-Trace": "abc"}
	animeID := "anime-1"
	terminal.AnimeID = &animeID

	if err := store.UpsertCapture(context.Background(), terminal); err != nil {
		t.Fatalf("upsert terminal first: %v", err)
	}

	arrival := BuildTransportCaptureRecord("req-reverse-order", 100, "patch", "/api/animes/anime-1", "http")
	if err := store.UpsertCapture(context.Background(), arrival); err != nil {
		t.Fatalf("upsert arrival second: %v", err)
	}

	assertCaptureDetail(t, fetchCaptureDetail(t, db, "req-reverse-order"), captureExpectation{
		outcome:        "accepted",
		httpStatus:     200,
		durationMS:     42,
		requestBody:    requestBody,
		requestState:   CaptureStateOmittedTooLarge,
		responseBody:   responseBody,
		responseState:  CaptureStateTruncated,
		requestHeader:  headerExpectation{key: "Content-Type", value: "application/json"},
		responseHeader: headerExpectation{key: "X-Trace", value: "abc"},
	})
}

func TestUpsertCaptureStillAllowsTerminalToTerminalEnrichmentUpdates(t *testing.T) {
	t.Parallel()

	db := openCaptureTestDB(t)
	store := NewStore(db, StoreConfig{})

	first := BuildTransportCaptureRecord("req-terminal-update", 100, "patch", "/api/animes/anime-1", "http")
	first.Outcome = "accepted"
	status := 200
	first.HTTPStatus = &status
	if err := store.UpsertCapture(context.Background(), first); err != nil {
		t.Fatalf("upsert first terminal: %v", err)
	}

	second := first
	duration := int64(64)
	second.DurationMS = &duration
	requestBody := `{"kept":true}`
	second.RequestBody = &requestBody
	second.RequestBodyState = CaptureStateOmittedTooLarge
	responseBody := `{"ok":true}`
	second.ResponseBody = &responseBody
	second.ResponseBodyState = CaptureStateTruncated
	second.RequestHeaders = map[string]string{"Content-Type": "application/json"}
	second.ResponseHeaders = map[string]string{"X-Trace": "later"}
	if err := store.UpsertCapture(context.Background(), second); err != nil {
		t.Fatalf("upsert second terminal: %v", err)
	}

	assertCaptureDetail(t, fetchCaptureDetail(t, db, "req-terminal-update"), captureExpectation{
		outcome:        "accepted",
		httpStatus:     200,
		durationMS:     64,
		requestBody:    requestBody,
		requestState:   CaptureStateOmittedTooLarge,
		responseBody:   responseBody,
		responseState:  CaptureStateTruncated,
		requestHeader:  headerExpectation{key: "Content-Type", value: "application/json"},
		responseHeader: headerExpectation{key: "X-Trace", value: "later"},
	})
}
