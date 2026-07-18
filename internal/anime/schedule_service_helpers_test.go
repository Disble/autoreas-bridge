package anime_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// animeIDFromSchedulePayload extracts an ID from a schedule payload.
func animeIDFromSchedulePayload(t *testing.T, payload string) string {
	t.Helper()
	var decoded struct {
		ID string `json:"_id"`
	}
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatalf("decode anime id from payload: %v", err)
	}
	return decoded.ID
}

// decodeSchedulePayloadDays decodes day placements from a schedule payload.
func decodeSchedulePayloadDays(t *testing.T, payload []byte) []struct {
	Dia   string  `json:"dia"`
	Orden float64 `json:"orden"`
} {
	t.Helper()
	var decoded struct {
		Dias []struct {
			Dia   string  `json:"dia"`
			Orden float64 `json:"orden"`
		} `json:"dias"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode schedule payload days: %v", err)
	}
	return decoded.Dias
}

// assertSchedulePlacement verifies one normalized schedule placement.
func assertSchedulePlacement(t *testing.T, placementsByAnime map[string][]contracts.MobileAnimeDay, animeID, destination string, order int) {
	t.Helper()
	placements := placementsByAnime[animeID]
	if len(placements) != 1 || placements[0].Dia != destination || placements[0].Orden != order {
		t.Fatalf("expected %s at %s#%d, got %+v", animeID, destination, order, placements)
	}
}

// assertSchedulePublishedAnimeChanged verifies a published schedule event.
func assertSchedulePublishedAnimeChanged(t *testing.T, event events.Event, wantID string, wantPayload string) {
	t.Helper()
	changed, ok := event.(events.AnimeChangedEvent)
	if !ok {
		t.Fatalf("expected AnimeChangedEvent, got %T", event)
	}
	if changed.AnimeID != wantID {
		t.Fatalf("expected anime id %q, got %q", wantID, changed.AnimeID)
	}
	if !jsonValueEqual(t, changed.Payload, []byte(wantPayload)) {
		t.Fatalf("expected payload %s, got %s", wantPayload, string(changed.Payload))
	}
}

type failingSecondWriteAnimeWriter struct {
	calls int
	path  string
}

func (w *failingSecondWriteAnimeWriter) RequestWrite(context.Context, string, []byte) error {
	w.calls++
	if w.calls == 2 {
		return errors.New("second append failed")
	}
	return nil
}

func (w *failingSecondWriteAnimeWriter) LegacyFilePath() string { return w.path }

func (w *failingSecondWriteAnimeWriter) ReplaceFile(context.Context, string, [][]byte) error {
	w.calls++
	if w.calls == 1 {
		return errors.New("second append failed")
	}
	return nil
}
