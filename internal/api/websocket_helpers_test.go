package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/observability/mobilecapture"
	"autoreas-bridge/internal/realtime"
	bridgeSync "autoreas-bridge/internal/sync"
	"github.com/gorilla/websocket"
)

// newWebsocketTestServer creates a websocket test server and its cleanup function.
func newWebsocketTestServer(t *testing.T, config Config) (*realtime.MemoryHub, string, func()) {
	t.Helper()

	hub, ok := config.RealtimeHub.(*realtime.MemoryHub)
	if !ok {
		t.Fatal("expected realtime memory hub in test config")
	}
	handler := NewHandler(config)
	server := httptest.NewServer(handler)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	return hub, wsURL, func() {
		server.Close()
		if err := hub.Close(); err != nil {
			t.Errorf("close realtime hub: %v", err)
		}
	}
}

// closeWebsocket closes a websocket and reports failures through the test.
func closeWebsocket(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	if err := conn.Close(); err != nil {
		t.Errorf("close websocket: %v", err)
	}
}

// dialWebSocketWithToken dials the websocket with the provided bearer token.
func dialWebSocketWithToken(t *testing.T, wsURL string, token string) *websocket.Conn {
	t.Helper()
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+token)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	return conn
}

// readControlMessage reads the initial control message from a websocket.
func readControlMessage(t *testing.T, conn *websocket.Conn) realtime.ControlMessage {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	var msg realtime.ControlMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read control message: %v", err)
	}
	return msg
}

// waitForClientCount waits for the realtime hub to reach the expected count.
func waitForClientCount(t *testing.T, hub *realtime.MemoryHub, want int) {
	t.Helper()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if hub.ClientCount() == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("expected client count %d, got %d", want, hub.ClientCount())
}

// waitForCaptureCount waits until the captures slice reaches the expected length.
func waitForCaptureCount(t *testing.T, captures *[]mobilecapture.CaptureRecord, want int) {
	t.Helper()
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(*captures) == want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected %d captures, got %#v", want, *captures)
}

// newWebSocketWriteEnvironment creates database and service test state.
func newWebSocketWriteEnvironment(t *testing.T) (*bridgeSync.AnimeSnapshotStore, *anime.QueryService, *anime.WriteService) {
	t.Helper()
	seed := `{"id":"anime-1","name":"One Piece","episodesWatched":661,"status":2,"totalEpisodes":1200,"active":true}`
	db, err := bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "bridge.db"))
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close bridge db: %v", err)
		}
	})
	store := bridgeSync.NewAnimeSnapshotStore(db)
	seedWebSocketAnimeSnapshot(t, store, "anime-1", seed)
	bus := events.NewBus()
	ctx, cancel := context.WithCancel(context.Background())
	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{Bus: bus, Publisher: bus, Logger: websocketWarningLogger{}, SelfEchoRegistry: anime.NewSelfEchoRegistry()})
	writer.StartAsync(ctx)
	t.Cleanup(func() { cancel(); writer.Wait() })
	write := anime.NewWriteService(store, writer)
	write.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	return store, anime.NewQueryService(store), write
}

// websocketWarningLogger discards warning logs for websocket tests.
type websocketWarningLogger struct{}

func (websocketWarningLogger) Warnf(string, ...any) {}

// stubWebSocketAnimeWrite is a stub anime write service for websocket tests.
type stubWebSocketAnimeWrite struct{ err error }

func (s stubWebSocketAnimeWrite) PatchAnime(context.Context, string, contracts.AnimePatch) (contracts.AnimePatchResult, error) {
	if s.err != nil {
		return contracts.AnimePatchResult{}, s.err
	}
	return contracts.AnimePatchResult{Outcome: contracts.AnimePatchOutcomeApplied, ModifiedAt: 1000}, nil
}

// assertJSONLineEqualForWebSocketTest compares two JSON lines structurally.
func assertJSONLineEqualForWebSocketTest(t *testing.T, got string, want string) {
	t.Helper()
	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got line: %v", err)
	}
	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal want line: %v", err)
	}
	if !deepEqualJSON(gotValue, wantValue) {
		t.Fatalf("expected line %s, got %s", want, got)
	}
}

// deepEqualJSON compares JSON-compatible values by their encoded representation.
func deepEqualJSON(got any, want any) bool {
	left, err := json.Marshal(got)
	if err != nil {
		return false
	}
	right, err := json.Marshal(want)
	if err != nil {
		return false
	}
	return string(left) == string(right)
}

// seedWebSocketAnimeSnapshot stores the baseline used by websocket write tests.
func seedWebSocketAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
	t.Helper()
	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
		},
	}
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot: %v", err)
	}
}
