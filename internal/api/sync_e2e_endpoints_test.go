package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
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
		SnapshotJSON:  []byte(`{"id":"anime-1","name":"One Piece","episodesWatched":664,"status":2,"totalEpisodes":1200,"active":true}`),
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
	if changesPayload.Changes[0].Snapshot.EpisodesWatched != 661 {
		t.Fatalf("expected change snapshot nrocapvisto 661 (the stored anime), got %v", changesPayload.Changes[0].Snapshot.EpisodesWatched)
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
	if reconcilePayload.BridgeChanges[0].Snapshot == nil || reconcilePayload.BridgeChanges[0].Snapshot.EpisodesWatched != 661 {
		t.Fatalf("expected reconcile bridge change snapshot nrocapvisto 661 (the stored anime), got %#v", reconcilePayload.BridgeChanges[0].Snapshot)
	}

	assertReconcileUpdatesApplyThenConflict(t, env, reconcilePayload.LastChangelogID)
}

// assertReconcileUpdatesApplyThenConflict posts one update on the current base
// and one on the now-stale base: the first applies with the stamped token, the
// second conflicts and echoes it, and the applied write advances
// last_changelog_id through the real changelog.
func assertReconcileUpdatesApplyThenConflict(t *testing.T, env *syncE2EHTTPEndpointEnv, lastChangelogID int64) {
	t.Helper()
	current, err := env.snapshotStore.GetSnapshot(env.ctx, "anime-1")
	if err != nil {
		t.Fatalf("get seeded snapshot: %v", err)
	}
	body := fmt.Sprintf(`{"device_id":"device-1","last_changelog_id":%d,"pending_operations":[`+
		`{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":662,"base":%d},"created_at":1710000000458},`+
		`{"anime_id":"anime-1","operation":"update","payload":{"episodesWatched":663,"base":%d},"created_at":1710000000459}]}`,
		lastChangelogID, current.ModifiedAt, current.ModifiedAt)
	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer good-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	env.handler.ServeHTTP(res, req)
	if res.Code != http.StatusAccepted {
		t.Fatalf("expected POST /api/sync/reconcile status 202, got %d body=%s", res.Code, res.Body.String())
	}
	var payload contracts.ReconcileResponse
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode POST /api/sync/reconcile response: %v", err)
	}
	stamped := syncE2EWriteClockMs
	want := []contracts.AppliedOperation{
		{AnimeID: "anime-1", Operation: "update", Applied: true, ModifiedAt: &stamped},
		{AnimeID: "anime-1", Operation: "update", Applied: false, ModifiedAt: &stamped, Reason: contracts.AppliedOperationReasonConflict},
	}
	if len(payload.AppliedOperations) != len(want) {
		t.Fatalf("expected applied_operations %d entries, got %s", len(want), res.Body.String())
	}
	for index, got := range payload.AppliedOperations {
		if got.ModifiedAt == nil || *got.ModifiedAt != *want[index].ModifiedAt || got.AnimeID != want[index].AnimeID ||
			got.Operation != want[index].Operation || got.Applied != want[index].Applied || got.Reason != want[index].Reason {
			t.Fatalf("applied_operations[%d]: want %+v modified_at %d, got %s", index, want[index], stamped, res.Body.String())
		}
	}
	if payload.LastChangelogID <= lastChangelogID || len(payload.BridgeChanges) != 1 ||
		payload.BridgeChanges[0].Snapshot == nil || payload.BridgeChanges[0].Snapshot.EpisodesWatched != 662 {
		t.Fatalf("expected last_changelog_id past %d serving the applied update, got %s", lastChangelogID, res.Body.String())
	}
}

func TestSyncEndpointsIgnoreMalformedChangelogSnapshotInsteadOfReturning500(t *testing.T) {
	t.Parallel()

	env := newSyncE2EHTTPEndpointEnv(t)
	// The store only writes the anime's stored snapshot, so a malformed row can only predate it: it
	// is written straight into the table.
	if _, err := env.db.ExecContext(env.ctx, `INSERT INTO changelog (anime_id, change_type, changed_fields_json, snapshot_json, status, changed_at_ms)
		VALUES ('broken-1', 'update', '["nrocapvisto"]', '{"name":"broken"', 'pending', 1710000000122)`); err != nil {
		t.Fatalf("insert malformed changelog row: %v", err)
	}
	if err := env.changelogStore.InsertPending(env.ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"id":"anime-1","name":"One Piece","episodesWatched":664,"status":2,"totalEpisodes":1200,"active":true}`),
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

// TestSyncReconcilePlusOneThatMovesASeasonAnimeToVistoIsOneSave pins the two
// mobile invariants of the in-transaction Season move (L6): the applied
// operation echoes the FINAL token of the single save, whose snapshot already
// holds days=[Visto], and that save's only changelog row names `days` together
// with the progress fields.
func TestSyncReconcilePlusOneThatMovesASeasonAnimeToVistoIsOneSave(t *testing.T) {
	t.Parallel()

	env := newSyncE2EHTTPEndpointEnv(t)
	seedSyncE2ESnapshot(t, env.snapshotStore, "anime-2", `{"id":"anime-2","name":"Show","episodesWatched":0,"status":0,"totalEpisodes":12,"active":true,"days":[{"day":"Ver hoy","order":1}]}`)
	seedSyncE2EOpenSeasonRow(t, env, "anime-2")

	base, err := env.snapshotStore.GetSnapshot(env.ctx, "anime-2")
	if err != nil {
		t.Fatalf("get seeded snapshot: %v", err)
	}
	// The phone's +1: the watched count one past the stored one, on the stored token.
	body := fmt.Sprintf(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[`+
		`{"anime_id":"anime-2","operation":"update","payload":{"episodesWatched":1,"base":%d},"created_at":1710000000460}]}`, base.ModifiedAt)
	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer good-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	env.handler.ServeHTTP(res, req)
	var payload contracts.ReconcileResponse
	if res.Code != http.StatusAccepted || json.Unmarshal(res.Body.Bytes(), &payload) != nil {
		t.Fatalf("expected an accepted reconcile, got %d body=%s", res.Code, res.Body.String())
	}

	stored, err := env.snapshotStore.GetSnapshot(env.ctx, "anime-2")
	if err != nil {
		t.Fatalf("get saved snapshot: %v", err)
	}
	var value struct {
		Days []contracts.MobileAnimeDay `json:"days"`
	}
	if err := json.Unmarshal(stored.CanonicalJSON, &value); err != nil || len(value.Days) != 1 || value.Days[0].Day != "Visto" {
		t.Fatalf("expected the save to leave days=[Visto], got %s (%v) body=%s", stored.CanonicalJSON, err, res.Body.String())
	}
	// (a) The token the phone stores is the token of the snapshot already in Visto.
	if len(payload.AppliedOperations) != 1 || !payload.AppliedOperations[0].Applied || payload.AppliedOperations[0].ModifiedAt == nil ||
		*payload.AppliedOperations[0].ModifiedAt != stored.ModifiedAt {
		t.Fatalf("expected one applied operation echoing the final token %d, got %s", stored.ModifiedAt, res.Body.String())
	}
	assertSingleSeasonMoveChangelogRow(t, env, "anime-2", stored.CanonicalJSON)
}

// assertSingleSeasonMoveChangelogRow fails unless animeID has exactly one
// changelog row, holding the saved snapshot and naming `days` with the
// progress field (invariant b).
func assertSingleSeasonMoveChangelogRow(t *testing.T, env *syncE2EHTTPEndpointEnv, animeID string, snapshot []byte) {
	t.Helper()
	rows, err := env.changelogStore.ListAfterID(env.ctx, 0)
	if err != nil {
		t.Fatalf("list changelog: %v", err)
	}
	var mine []bridgeSync.ChangelogEntry
	for _, row := range rows {
		if row.AnimeID == animeID {
			mine = append(mine, row)
		}
	}
	if len(mine) != 1 || string(mine[0].SnapshotJSON) != string(snapshot) ||
		!slices.Contains(mine[0].ChangedFields, "days") || !slices.Contains(mine[0].ChangedFields, "episodesWatched") {
		t.Fatalf("expected one changelog row with the saved snapshot naming days and episodesWatched, got %+v", mine)
	}
}
