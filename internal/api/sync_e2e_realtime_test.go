package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/realtime"
)

func TestWebSocketReconcileEndToEndUpdatesFileSnapshotChangelogAndBroadcast(t *testing.T) {
	t.Parallel()

	env := newSyncE2ERealtimeEnv(t, 25*time.Millisecond)
	conn, control := env.dialWebSocket(t)
	if control.Type != realtime.MessageTypeSyncRequired {
		t.Fatalf("expected sync_required, got %#v", control)
	}

	if err := conn.WriteJSON(map[string]any{
		"type":              "reconcile",
		"device_id":         "device-1",
		"last_changelog_id": 0,
		"pending_operations": []map[string]any{{
			"anime_id":   "anime-1",
			"operation":  "update",
			"payload":    map[string]any{"nrocapvisto": 664.0, "base": 0},
			"created_at": 1710000000123,
		}},
	}); err != nil {
		t.Fatalf("write websocket reconcile message: %v", err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var changed realtime.AnimeChangedMessage
	if err := conn.ReadJSON(&changed); err != nil {
		t.Fatalf("read anime_changed after inbound reconcile: %v", err)
	}
	if changed.Type != realtime.MessageTypeAnimeChanged || changed.AnimeID != "anime-1" {
		t.Fatalf("unexpected anime_changed payload %#v", changed)
	}

	eventuallyWithinSyncE2E(t, 3*time.Second, func() bool {
		lines := readSyncE2EAnimeDataLines(t, env.dataPath)
		return len(lines) == 2
	})
	lines := readSyncE2EAnimeDataLines(t, env.dataPath)
	assertSyncE2EJSONLine(t, lines[1], `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"fechaUltCapVisto":{"$$date":1710000000123}}`)

	eventuallyWithinSyncE2E(t, 3*time.Second, func() bool {
		record, err := env.snapshotStore.GetSnapshot(env.ctx, "anime-1")
		if err != nil {
			return false
		}
		return strings.Contains(string(record.CanonicalJSON), `"nrocapvisto":664`)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/animes/anime-1", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	env.handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("expected GET /api/animes/anime-1 status 200, got %d body=%s", res.Code, res.Body.String())
	}
	var detail contracts.MobileAnime
	if err := json.Unmarshal(res.Body.Bytes(), &detail); err != nil {
		t.Fatalf("decode anime detail response: %v", err)
	}
	if detail.NroCapVisto != 664 {
		t.Fatalf("expected detail nrocapvisto 664, got %v", detail.NroCapVisto)
	}

	eventuallyWithinSyncE2E(t, 3*time.Second, func() bool {
		entries, err := env.changelogStore.ListAfterID(env.ctx, 0)
		if err != nil || len(entries) == 0 {
			return false
		}
		last := entries[len(entries)-1]
		return last.AnimeID == "anime-1" && strings.Contains(string(last.SnapshotJSON), `"nrocapvisto":664`)
	})
	entries, err := env.changelogStore.ListAfterID(env.ctx, 0)
	if err != nil {
		t.Fatalf("list changelog after id: %v", err)
	}
	last := entries[len(entries)-1]
	if last.ChangeType != events.AnimeChangeTypeUpdate {
		t.Fatalf("expected changelog type %q, got %q", events.AnimeChangeTypeUpdate, last.ChangeType)
	}
	if last.AnimeID != "anime-1" {
		t.Fatalf("expected changelog anime id %q, got %q", "anime-1", last.AnimeID)
	}
	if !strings.Contains(string(last.SnapshotJSON), `"nrocapvisto":664`) {
		t.Fatalf("expected changelog snapshot to contain updated progress, got %s", string(last.SnapshotJSON))
	}

	if err := env.watcher.Err(); err != nil {
		t.Fatalf("expected watcher healthy, got %v", err)
	}
	if err := env.writer.Err(); err != nil {
		t.Fatalf("expected writer healthy, got %v", err)
	}
	if err := env.recorder.Err(); err != nil {
		t.Fatalf("expected recorder healthy, got %v", err)
	}
}

func TestWebSocketReconcileEndToEndPreservesFirstWriteDuringWatcherLag(t *testing.T) {
	t.Parallel()

	env := newSyncE2ERealtimeEnv(t, 750*time.Millisecond)
	conn, _ := env.dialWebSocket(t)

	if err := conn.WriteJSON(map[string]any{
		"type":              "reconcile",
		"device_id":         "device-1",
		"last_changelog_id": 0,
		"pending_operations": []map[string]any{{
			"anime_id":   "anime-1",
			"operation":  "update",
			"payload":    map[string]any{"nrocapvisto": 664.0, "base": 0},
			"created_at": 1710000000123,
		}},
	}); err != nil {
		t.Fatalf("write first websocket reconcile message: %v", err)
	}

	if err := conn.WriteJSON(map[string]any{
		"type":              "reconcile",
		"device_id":         "device-1",
		"last_changelog_id": 0,
		"pending_operations": []map[string]any{{
			"anime_id":   "anime-1",
			"operation":  "update",
			"payload":    map[string]any{"dias": []string{"Martes", "Miercoles"}, "base": 1710000000123},
			"created_at": 1710000000124,
		}},
	}); err != nil {
		t.Fatalf("write second websocket reconcile message: %v", err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	for range 2 {
		var changed realtime.AnimeChangedMessage
		if err := conn.ReadJSON(&changed); err != nil {
			t.Fatalf("read anime_changed during sequential write test: %v", err)
		}
	}

	eventuallyWithinSyncE2E(t, 3*time.Second, func() bool {
		return len(readSyncE2EAnimeDataLines(t, env.dataPath)) == 3
	})
	lines := readSyncE2EAnimeDataLines(t, env.dataPath)
	assertSyncE2EJSONLine(t, lines[2], `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"dias":[{"dia":"Martes","orden":1},{"dia":"Miercoles","orden":2}],"fechaUltCapVisto":{"$$date":1710000000123}}`)
}
