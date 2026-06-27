package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

func TestSyncEndpointsHandleCapPlusAndIncrementalChangesWithout500(t *testing.T) {
	t.Parallel()

	env := newSyncE2EHTTPEndpointEnv(t)
	if err := env.changelogStore.InsertPending(env.ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true}`),
		ChangedAtMs:   1710000000123,
	}); err != nil {
		t.Fatalf("insert pending changelog: %v", err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/animes/changes?since=0", nil)
	getReq.Header.Set("Authorization", "Bearer good-token")
	getRes := httptest.NewRecorder()
	env.handler.ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected GET /api/animes/changes status 200, got %d body=%s", getRes.Code, getRes.Body.String())
	}
	var changesPayload struct {
		Changes         []contracts.AnimeChange `json:"changes"`
		LastChangelogID int64                   `json:"last_changelog_id"`
	}
	if err := json.Unmarshal(getRes.Body.Bytes(), &changesPayload); err != nil {
		t.Fatalf("decode GET /api/animes/changes response: %v", err)
	}
	if len(changesPayload.Changes) != 1 || changesPayload.Changes[0].Snapshot == nil {
		t.Fatalf("expected one serialized change with snapshot, got %#v", changesPayload)
	}
	if changesPayload.Changes[0].Snapshot.NroCapVisto != 664 {
		t.Fatalf("expected change snapshot nrocapvisto 664, got %v", changesPayload.Changes[0].Snapshot.NroCapVisto)
	}

	postReq := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"cap_plus","payload":{},"created_at":1710000000456},{"anime_id":"anime-1","operation":"cap_minus","payload":{},"created_at":1710000000457}]}`))
	postReq.Header.Set("Authorization", "Bearer good-token")
	postReq.Header.Set("Content-Type", "application/json")
	postRes := httptest.NewRecorder()
	env.handler.ServeHTTP(postRes, postReq)
	if postRes.Code != http.StatusAccepted {
		t.Fatalf("expected POST /api/sync/reconcile status 202, got %d body=%s", postRes.Code, postRes.Body.String())
	}
	var reconcilePayload contracts.ReconcileResponse
	if err := json.Unmarshal(postRes.Body.Bytes(), &reconcilePayload); err != nil {
		t.Fatalf("decode POST /api/sync/reconcile response: %v", err)
	}
	if reconcilePayload.Status != "accepted" || len(reconcilePayload.BridgeChanges) != 1 {
		t.Fatalf("unexpected reconcile payload %#v", reconcilePayload)
	}
	if reconcilePayload.LastChangelogID <= 0 {
		t.Fatalf("expected positive last_changelog_id, got %d", reconcilePayload.LastChangelogID)
	}
	if reconcilePayload.BridgeChanges[0].Snapshot == nil || reconcilePayload.BridgeChanges[0].Snapshot.NroCapVisto != 664 {
		t.Fatalf("expected reconcile bridge change snapshot nrocapvisto 664, got %#v", reconcilePayload.BridgeChanges[0].Snapshot)
	}
}

func TestSyncEndpointsIgnoreMalformedChangelogSnapshotInsteadOfReturning500(t *testing.T) {
	t.Parallel()

	env := newSyncE2EHTTPEndpointEnv(t)
	if err := env.changelogStore.InsertPending(env.ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "broken-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"nombre":"broken"`),
		ChangedAtMs:   1710000000122,
	}); err != nil {
		t.Fatalf("insert malformed changelog row: %v", err)
	}
	if err := env.changelogStore.InsertPending(env.ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true}`),
		ChangedAtMs:   1710000000123,
	}); err != nil {
		t.Fatalf("insert good changelog row: %v", err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/animes/changes?since=0", nil)
	getReq.Header.Set("Authorization", "Bearer good-token")
	getRes := httptest.NewRecorder()
	env.handler.ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected GET /api/animes/changes status 200 despite malformed row, got %d body=%s", getRes.Code, getRes.Body.String())
	}

	postReq := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[]}`))
	postReq.Header.Set("Authorization", "Bearer good-token")
	postReq.Header.Set("Content-Type", "application/json")
	postRes := httptest.NewRecorder()
	env.handler.ServeHTTP(postRes, postReq)
	if postRes.Code != http.StatusAccepted {
		t.Fatalf("expected POST /api/sync/reconcile status 202 despite malformed row, got %d body=%s", postRes.Code, postRes.Body.String())
	}
}
