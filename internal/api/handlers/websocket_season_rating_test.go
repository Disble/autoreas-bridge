package handlers

import (
	"context"
	"testing"

	"autoreas-bridge/internal/device"
)

func TestWebSocketDispatchesSeasonRating(t *testing.T) {
	var gotID string
	var gotNota int
	var gotRatedAt int64
	config := WebSocketHandlerConfig{
		RecordSeasonRating: func(_ context.Context, animeID string, grade int, ratedAtMs int64) (SeasonRatingResult, error) {
			gotID, gotNota, gotRatedAt = animeID, grade, ratedAtMs
			return SeasonRatingResult{Outcome: SeasonRatingRecorded}, nil
		},
	}
	payload := []byte(`{"type":"season_rating","anime_id":"anime-a","grade":4,"rated_at":1751500000000}`)

	if err := handleIncomingWebSocketMessage(context.Background(), device.PairedDevice{DeviceID: "dev-1"}, payload, config, nil); err != nil {
		t.Fatalf("handleIncomingWebSocketMessage: %v", err)
	}
	if gotID != "anime-a" || gotNota != 4 || gotRatedAt != 1751500000000 {
		t.Fatalf("rating not dispatched: id=%q grade=%d ratedAt=%d", gotID, gotNota, gotRatedAt)
	}
}

func TestWebSocketSeasonRatingDoesNotTriggerReconcile(t *testing.T) {
	reconcileCalls := 0
	config := WebSocketHandlerConfig{
		RecordSeasonRating: func(context.Context, string, int, int64) (SeasonRatingResult, error) {
			return SeasonRatingResult{Outcome: SeasonRatingRecorded}, nil
		},
		TriggerReconcile: func(context.Context) error { reconcileCalls++; return nil },
	}
	payload := []byte(`{"type":"season_rating","anime_id":"anime-a","grade":4,"rated_at":1}`)

	if err := handleIncomingWebSocketMessage(context.Background(), device.PairedDevice{DeviceID: "dev-1"}, payload, config, nil); err != nil {
		t.Fatalf("handleIncomingWebSocketMessage: %v", err)
	}
	if reconcileCalls != 0 {
		t.Fatalf("a season_rating message must not trigger a reconcile")
	}
}

func TestWebSocketReconcileStillWorksWithoutRatingRecorder(t *testing.T) {
	reconcileCalls := 0
	config := WebSocketHandlerConfig{
		TriggerReconcile: func(context.Context) error { reconcileCalls++; return nil },
	}
	payload := []byte(`{"type":"reconcile"}`)

	if err := handleIncomingWebSocketMessage(context.Background(), device.PairedDevice{DeviceID: "dev-1"}, payload, config, nil); err != nil {
		t.Fatalf("handleIncomingWebSocketMessage: %v", err)
	}
	if reconcileCalls != 1 {
		t.Fatalf("reconcile path regressed: calls=%d", reconcileCalls)
	}
}
