package realtime

import (
	"encoding/json"
	"testing"
)

func TestControlMessageJSON(t *testing.T) {
	t.Parallel()

	payload, err := json.Marshal(ControlMessage{
		Type:   MessageTypeSyncRequired,
		Reason: SyncReasonConnectionGapAssumed,
	})
	if err != nil {
		t.Fatalf("marshal control message: %v", err)
	}

	if got, want := string(payload), `{"type":"sync_required","reason":"connection_gap_assumed"}`; got != want {
		t.Fatalf("expected %s, got %s", want, got)
	}
}

func TestAnimeChangedMessageJSON(t *testing.T) {
	t.Parallel()

	payload, err := json.Marshal(AnimeChangedMessage{
		Type:    MessageTypeAnimeChanged,
		AnimeID: "anime-123",
		Payload: json.RawMessage(`{"nombre":"Bleach"}`),
	})
	if err != nil {
		t.Fatalf("marshal anime changed message: %v", err)
	}

	if got, want := string(payload), `{"type":"anime_changed","anime_id":"anime-123","payload":{"nombre":"Bleach"}}`; got != want {
		t.Fatalf("expected %s, got %s", want, got)
	}
}

func TestAnimeIDMessageJSON(t *testing.T) {
	t.Parallel()

	payload, err := json.Marshal(AnimeIDMessage{
		Type:    MessageTypeAnimeCreated,
		AnimeID: "anime-123",
	})
	if err != nil {
		t.Fatalf("marshal anime created message: %v", err)
	}

	if got, want := string(payload), `{"type":"anime_created","anime_id":"anime-123"}`; got != want {
		t.Fatalf("expected %s, got %s", want, got)
	}
}
