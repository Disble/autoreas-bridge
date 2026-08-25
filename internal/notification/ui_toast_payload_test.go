package notification

import (
	"context"
	"encoding/json"
	"testing"
)

// emitOnce captures the single payload one Deliver emits, already round-tripped through JSON --
// which is what the Wails runtime does to it before the frontend ever sees it. Asserting on the
// Go value would pass against a shape the frontend cannot read.
func emitOnce(t *testing.T, delivery Delivery) map[string]any {
	t.Helper()

	var payloads []any
	adapter := NewUIToastAdapter(func(_ context.Context, _ string, optionalData ...interface{}) {
		payloads = append(payloads, optionalData...)
	})

	if err := adapter.Deliver(context.Background(), delivery); err != nil {
		t.Fatalf("Deliver: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("emitted %d payloads, want 1", len(payloads))
	}

	encoded, err := json.Marshal(payloads[0])
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	return decoded
}

// TestUIToastPayloadStaysFlat is the compatibility guard. The frontend contract
// (shared/contracts/notification.types.ts) reads Title/Body/Level/... at the top level, so the
// identity has to be ADDED beside them, never nested under a wrapper -- a nested payload would
// blank every toast in the app at once.
func TestUIToastPayloadStaysFlat(t *testing.T) {
	t.Parallel()

	payload := emitOnce(t, Delivery{Notification: Notification{
		Title: "Download run completed", Body: "1 episode(s) downloaded.",
		Level: LevelSuccess, Source: "download", Kind: "run_completed",
	}})

	for key, want := range map[string]any{
		"Title":  "Download run completed",
		"Body":   "1 episode(s) downloaded.",
		"Level":  "success",
		"Source": "download",
		"Kind":   "run_completed",
	} {
		if payload[key] != want {
			t.Fatalf("payload[%q] = %#v, want %#v", key, payload[key], want)
		}
	}
}

// TestUIToastPayloadCarriesTheRecordID: the frontend contract has declared this field optional
// since Slice 4-i, waiting for a producer to start sending one. Until now nothing ever did, so
// the toast's "View details" affordance never rendered a single time.
func TestUIToastPayloadCarriesTheRecordID(t *testing.T) {
	t.Parallel()

	payload := emitOnce(t, Delivery{Notification: Notification{Title: "x"}, RecordID: 42})

	if payload["RecordID"] != float64(42) {
		t.Fatalf("payload[RecordID] = %#v, want 42", payload["RecordID"])
	}
}

// TestUIToastPayloadGivesEveryActionItsIDAndRowRef is what lets the toast render a button that
// does something. The id addresses the persisted token; the rowRef is how the toast tells a
// footer verb from a row verb, which the old ActionSpec mirror could not express at all.
func TestUIToastPayloadGivesEveryActionItsIDAndRowRef(t *testing.T) {
	t.Parallel()

	payload := emitOnce(t, Delivery{
		Notification: Notification{Actions: []ActionSpec{
			{Label: "Open Downloads", Intent: "navigation.open", Args: map[string]string{"route": "/downloads"}},
			{Label: "Watch", Intent: "navigation.open", RowRef: "anime-7"},
		}},
		ActionIDs: []string{"act-1", "act-2"},
	})

	actions, ok := payload["Actions"].([]any)
	if !ok || len(actions) != 2 {
		t.Fatalf("payload[Actions] = %#v, want two entries", payload["Actions"])
	}

	first, _ := actions[0].(map[string]any)
	if first["ID"] != "act-1" || first["Label"] != "Open Downloads" || first["RowRef"] != "" {
		t.Fatalf("first action = %#v, want act-1 / Open Downloads / no row", first)
	}

	second, _ := actions[1].(map[string]any)
	if second["ID"] != "act-2" || second["RowRef"] != "anime-7" {
		t.Fatalf("second action = %#v, want act-2 bound to anime-7", second)
	}
}

// TestUIToastPayloadLeavesAnUnpersistedActionWithoutAnID: a delivery nothing persisted still
// reaches the toast, and its actions must arrive un-addressable rather than carrying a
// neighbour's id.
func TestUIToastPayloadLeavesAnUnpersistedActionWithoutAnID(t *testing.T) {
	t.Parallel()

	payload := emitOnce(t, Delivery{Notification: Notification{
		Actions: []ActionSpec{{Label: "Open Downloads", Intent: "navigation.open"}},
	}})

	actions, _ := payload["Actions"].([]any)
	if len(actions) != 1 {
		t.Fatalf("payload[Actions] = %#v, want the action to survive without identity", payload["Actions"])
	}
	if first, _ := actions[0].(map[string]any); first["ID"] != "" {
		t.Fatalf("unpersisted action = %#v, want an empty id", first)
	}
}
