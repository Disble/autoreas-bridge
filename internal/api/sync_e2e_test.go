package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"github.com/gorilla/websocket"
)

func TestWebSocketReconcileEndToEndUpdatesFileSnapshotChangelogAndBroadcast(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())

	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	writeSyncE2EAnimeDataFile(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`,
	})

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	deviceService := device.NewService(deviceStore)

	bus := events.NewBus()
	selfEcho := anime.NewSelfEchoRegistry()
	watcher := anime.NewRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath:         dataPath,
		Parser:           anime.NewSnapshotParser(),
		Store:            snapshotStore,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
		DebounceWindow:   25 * time.Millisecond,
		RetryDelay:       25 * time.Millisecond,
	})
	watcher.StartAsync(ctx)

	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
	})
	writer.StartAsync(ctx)
	defer func() {
		cancel()
		writer.Wait()
		watcher.Wait()
	}()

	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	recorder := bridgeSync.NewChangelogRecorder(bus, changelogStore)
	recorder.Start(ctx)
	defer recorder.Stop()

	hub := realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{})
	defer hub.Close()
	bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		hub.BroadcastAnimeChanged(ctx, changed)
	})

	query := anime.NewQueryService(snapshotStore)
	writeService := anime.NewWriteService(snapshotStore, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	syncTrigger := bridgeSync.NewTriggerService(bus, changelogStore)

	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    query,
		AnimeWrite:    writeService,
		SyncTrigger:   syncTrigger,
		RealtimeHub:   hub,
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	// Let the file watcher subscribe to the directory before the write.
	time.Sleep(100 * time.Millisecond)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var control realtime.ControlMessage
	if err := conn.ReadJSON(&control); err != nil {
		t.Fatalf("read sync_required: %v", err)
	}
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
			"payload":    map[string]any{"nrocapvisto": 664.0},
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
		lines := readSyncE2EAnimeDataLines(t, dataPath)
		return len(lines) == 2
	})
	lines := readSyncE2EAnimeDataLines(t, dataPath)
	assertSyncE2EJSONLine(t, lines[1], `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"fechaUltCapVisto":{"$$date":1710000000123}}`)

	eventuallyWithinSyncE2E(t, 3*time.Second, func() bool {
		record, err := snapshotStore.GetSnapshot(ctx, "anime-1")
		if err != nil {
			return false
		}
		return strings.Contains(string(record.CanonicalJSON), `"nrocapvisto":664`)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/animes/anime-1", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
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
		entries, err := changelogStore.ListAfterID(ctx, 0)
		if err != nil || len(entries) == 0 {
			return false
		}
		return entries[len(entries)-1].AnimeID == "anime-1" && strings.Contains(string(entries[len(entries)-1].SnapshotJSON), `"nrocapvisto":664`)
	})
	entries, err := changelogStore.ListAfterID(ctx, 0)
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

	if err := watcher.Err(); err != nil {
		t.Fatalf("expected watcher healthy, got %v", err)
	}
	if err := writer.Err(); err != nil {
		t.Fatalf("expected writer healthy, got %v", err)
	}
	if err := recorder.Err(); err != nil {
		t.Fatalf("expected recorder healthy, got %v", err)
	}
}

func TestWebSocketReconcileEndToEndPreservesFirstWriteDuringWatcherLag(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())

	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	writeSyncE2EAnimeDataFile(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`,
	})

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	deviceService := device.NewService(deviceStore)

	bus := events.NewBus()
	selfEcho := anime.NewSelfEchoRegistry()
	watcher := anime.NewRuntimeWatcher(anime.RuntimeWatcherConfig{
		FilePath:         dataPath,
		Parser:           anime.NewSnapshotParser(),
		Store:            snapshotStore,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
		DebounceWindow:   750 * time.Millisecond,
		RetryDelay:       25 * time.Millisecond,
	})
	watcher.StartAsync(ctx)

	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        bus,
		SelfEchoRegistry: selfEcho,
	})
	writer.StartAsync(ctx)
	defer func() {
		cancel()
		writer.Wait()
		watcher.Wait()
	}()

	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	recorder := bridgeSync.NewChangelogRecorder(bus, changelogStore)
	recorder.Start(ctx)
	defer recorder.Stop()

	hub := realtime.NewMemoryHub(ctx, realtime.MemoryHubConfig{})
	defer hub.Close()
	bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
		changed, ok := event.(events.AnimeChangedEvent)
		if !ok {
			return
		}
		hub.BroadcastAnimeChanged(ctx, changed)
	})

	query := anime.NewQueryService(snapshotStore)
	writeService := anime.NewWriteService(snapshotStore, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	syncTrigger := bridgeSync.NewTriggerService(bus, changelogStore)

	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    query,
		AnimeWrite:    writeService,
		SyncTrigger:   syncTrigger,
		RealtimeHub:   hub,
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	time.Sleep(100 * time.Millisecond)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	headers := http.Header{}
	headers.Set("Authorization", "Bearer good-token")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var control realtime.ControlMessage
	if err := conn.ReadJSON(&control); err != nil {
		t.Fatalf("read sync_required: %v", err)
	}

	if err := conn.WriteJSON(map[string]any{
		"type":              "reconcile",
		"device_id":         "device-1",
		"last_changelog_id": 0,
		"pending_operations": []map[string]any{{
			"anime_id":   "anime-1",
			"operation":  "update",
			"payload":    map[string]any{"nrocapvisto": 664.0},
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
			"payload":    map[string]any{"dias": []string{"Martes", "Miercoles"}},
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
		return len(readSyncE2EAnimeDataLines(t, dataPath)) == 3
	})
	lines := readSyncE2EAnimeDataLines(t, dataPath)
	assertSyncE2EJSONLine(t, lines[2], `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"dias":[{"dia":"Martes","orden":1},{"dia":"Miercoles","orden":2}],"fechaUltCapVisto":{"$$date":1710000000123}}`)
}

func TestSyncEndpointsHandleCapPlusAndIncrementalChangesWithout500(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	deviceService := device.NewService(deviceStore)

	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	if err := changelogStore.InsertPending(ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true}`),
		ChangedAtMs:   1710000000123,
	}); err != nil {
		t.Fatalf("insert pending changelog: %v", err)
	}

	syncTrigger := bridgeSync.NewTriggerService(events.NewBus(), changelogStore)
	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    anime.NewQueryService(snapshotStore),
		SyncTrigger:   syncTrigger,
	})

	getReq := httptest.NewRequest(http.MethodGet, "/api/animes/changes?since=0", nil)
	getReq.Header.Set("Authorization", "Bearer good-token")
	getRes := httptest.NewRecorder()
	handler.ServeHTTP(getRes, getReq)
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
	handler.ServeHTTP(postRes, postReq)
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

	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	defer db.Close()

	snapshotStore := bridgeSync.NewAnimeSnapshotStore(db)
	seedSyncE2ESnapshot(t, snapshotStore, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	deviceStore := device.NewSQLiteStore(db)
	if err := deviceStore.InsertPairedDevice(ctx, device.StoredDevice{
		DeviceID:   "device-1",
		Name:       "Galaxy Tab",
		AuthToken:  "good-token",
		PairedAtMs: 1710000000000,
	}); err != nil {
		t.Fatalf("insert paired device: %v", err)
	}
	deviceService := device.NewService(deviceStore)

	changelogStore := bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(db))
	if err := changelogStore.InsertPending(ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "broken-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"nombre":"broken"`),
		ChangedAtMs:   1710000000122,
	}); err != nil {
		t.Fatalf("insert malformed changelog row: %v", err)
	}
	if err := changelogStore.InsertPending(ctx, bridgeSync.ChangelogEntry{
		AnimeID:       "anime-1",
		ChangeType:    events.AnimeChangeTypeUpdate,
		ChangedFields: []string{"nrocapvisto"},
		SnapshotJSON:  []byte(`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true}`),
		ChangedAtMs:   1710000000123,
	}); err != nil {
		t.Fatalf("insert good changelog row: %v", err)
	}

	syncTrigger := bridgeSync.NewTriggerService(events.NewBus(), changelogStore)
	handler := NewHandler(Config{
		DeviceService: deviceService,
		AnimeQuery:    anime.NewQueryService(snapshotStore),
		SyncTrigger:   syncTrigger,
	})

	getReq := httptest.NewRequest(http.MethodGet, "/api/animes/changes?since=0", nil)
	getReq.Header.Set("Authorization", "Bearer good-token")
	getRes := httptest.NewRecorder()
	handler.ServeHTTP(getRes, getReq)
	if getRes.Code != http.StatusOK {
		t.Fatalf("expected GET /api/animes/changes status 200 despite malformed row, got %d body=%s", getRes.Code, getRes.Body.String())
	}

	postReq := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[]}`))
	postReq.Header.Set("Authorization", "Bearer good-token")
	postReq.Header.Set("Content-Type", "application/json")
	postRes := httptest.NewRecorder()
	handler.ServeHTTP(postRes, postReq)
	if postRes.Code != http.StatusAccepted {
		t.Fatalf("expected POST /api/sync/reconcile status 202 despite malformed row, got %d body=%s", postRes.Code, postRes.Body.String())
	}
}

func writeSyncE2EAnimeDataFile(t *testing.T, filePath string, lines []string) {
	t.Helper()
	contents := []byte("")
	for _, line := range lines {
		contents = append(contents, []byte(line+"\n")...)
	}
	if err := os.WriteFile(filePath, contents, 0o600); err != nil {
		t.Fatalf("write anime data file: %v", err)
	}
}

func readSyncE2EAnimeDataLines(t *testing.T, filePath string) []string {
	t.Helper()
	contents, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("read anime data file: %v", err)
	}
	rawLines := strings.Split(strings.ReplaceAll(string(contents), "\r\n", "\n"), "\n")
	lines := make([]string, 0, len(rawLines))
	for _, line := range rawLines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func assertSyncE2EJSONLine(t *testing.T, got string, want string) {
	t.Helper()
	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got line: %v", err)
	}
	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal want line: %v", err)
	}
	gotJSON, _ := json.Marshal(gotValue)
	wantJSON, _ := json.Marshal(wantValue)
	if string(gotJSON) != string(wantJSON) {
		t.Fatalf("expected line %s, got %s", want, got)
	}
}

func seedSyncE2ESnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}, nil); err != nil {
		t.Fatalf("seed snapshot baseline: %v", err)
	}
}

func eventuallyWithinSyncE2E(t *testing.T, timeout time.Duration, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition not met before timeout")
}
