package anime_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	"autoreas-bridge/internal/events"
)

func TestPatchAnimeWaitsForDurableAppendBeforeReturning(t *testing.T) {
	t.Parallel()

	dataPath, handler, appendStarted, releaseAppend := newDurablePatchEnvironment(t)

	// base:0 matches the seeded snapshot's ModifiedAt (0, default for
	// pre-OCC-migration rows) -- a fast-forward, not an old-client safe path.
	req := httptest.NewRequest(http.MethodPatch, "/api/animes/anime-1", strings.NewReader(`{"nrocapvisto":10.5,"base":0}`))
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	requestDone := make(chan struct{})

	go func() {
		defer close(requestDone)
		handler.ServeHTTP(res, req)
	}()

	select {
	case <-appendStarted:
	case <-time.After(2 * time.Second):
		close(releaseAppend)
		t.Fatal("expected writer append to start")
	}

	select {
	case <-requestDone:
		close(releaseAppend)
		t.Fatal("expected PATCH response to wait for durable append")
	default:
	}

	assertAnimeDataLines(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true}`,
	})

	close(releaseAppend)

	select {
	case <-requestDone:
	case <-time.After(2 * time.Second):
		t.Fatal("expected PATCH request to complete after durable append")
	}

	if res.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusOK, res.Code, res.Body.String())
	}

	assertAnimeDataLines(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true}`,
		`{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":10.5,"estado":2,"totalcap":26,"activo":true,"fechaUltCapVisto":{"$$date":1710000000123}}`,
	})
}

// newDurablePatchEnvironment builds the durable writeback test environment.
func newDurablePatchEnvironment(t *testing.T) (string, http.Handler, chan struct{}, chan struct{}) {
	t.Helper()
	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	seed := `{"_id":"anime-1","nombre":"Cowboy Bebop","nrocapvisto":2,"estado":2,"totalcap":26,"activo":true}`
	writeAnimeDataFileForPatchTest(t, dataPath, []string{seed})
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", seed)
	bus := events.NewBus()
	started, release := make(chan struct{}, 1), make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{FilePath: dataPath, Bus: bus, Publisher: bus, Logger: &testWarningLogger{}, SelfEchoRegistry: anime.NewSelfEchoRegistry(), AppendLine: func(path string, payload []byte) error {
		started <- struct{}{}
		<-release
		return appendLineForTest(path, payload)
	}})
	writer.StartAsync(ctx)
	t.Cleanup(func() { cancel(); writer.Wait() })
	write := anime.NewWriteService(store, writer)
	write.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })
	return dataPath, api.NewHandler(api.Config{DeviceService: durablePatchAuthService{}, AnimeQuery: anime.NewQueryService(store), AnimeWrite: write}), started, release
}

func TestSyncReconcileAppliesPendingOperationsToAnimeDataFile(t *testing.T) {
	t.Parallel()

	dataPath := filepath.Join(t.TempDir(), "animes.dat")
	writeAnimeDataFileForPatchTest(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`,
	})

	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshot(t, store, "anime-1", `{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`)

	bus := events.NewBus()
	writerCtx, cancelWriter := context.WithCancel(context.Background())
	defer cancelWriter()

	writer := anime.NewUpdateWriter(anime.UpdateWriterConfig{
		FilePath:         dataPath,
		Bus:              bus,
		Publisher:        bus,
		Logger:           &testWarningLogger{},
		SelfEchoRegistry: anime.NewSelfEchoRegistry(),
	})
	writer.StartAsync(writerCtx)
	t.Cleanup(func() {
		cancelWriter()
		writer.Wait()
	})

	query := anime.NewQueryService(store)
	writeService := anime.NewWriteService(store, writer)
	writeService.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	handler := api.NewHandler(api.Config{
		DeviceService: durablePatchAuthService{},
		AnimeQuery:    query,
		AnimeWrite:    writeService,
		SyncTrigger:   reconcileStubSyncService{},
	})

	// base:0 matches the seeded snapshot's ModifiedAt (0, default for
	// pre-OCC-migration rows) -- a fast-forward, not an old-client safe path.
	req := httptest.NewRequest(http.MethodPost, "/api/sync/reconcile", strings.NewReader(`{"device_id":"device-1","last_changelog_id":0,"pending_operations":[{"anime_id":"anime-1","operation":"update","payload":{"nrocapvisto":664,"base":0},"created_at":1710000000123}]}`))
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d with body %s", http.StatusAccepted, res.Code, res.Body.String())
	}

	assertAnimeDataLines(t, dataPath, []string{
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":661,"estado":2,"totalcap":1200,"activo":true}`,
		`{"_id":"anime-1","nombre":"One Piece","nrocapvisto":664,"estado":2,"totalcap":1200,"activo":true,"fechaUltCapVisto":{"$$date":1710000000123}}`,
	})
}

type durablePatchAuthService struct{}

func (durablePatchAuthService) PairDevice(context.Context, device.PairDeviceRequest) (device.PairedDevice, error) {
	return device.PairedDevice{}, nil
}

func (durablePatchAuthService) AuthenticateToken(context.Context, string) (device.PairedDevice, error) {
	return device.PairedDevice{DeviceID: "device-1", Name: "Tablet", AuthToken: "good-token"}, nil
}

type testWarningLogger struct{}

func (testWarningLogger) Warnf(string, ...any) {}

type reconcileStubSyncService struct{}

func (reconcileStubSyncService) TriggerReconcile(context.Context) error { return nil }

func (reconcileStubSyncService) ListChangesSince(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return []contracts.AnimeChange{}, 0, nil
}

func (reconcileStubSyncService) ListChangesAfterID(context.Context, int64) ([]contracts.AnimeChange, int64, error) {
	return []contracts.AnimeChange{}, 0, nil
}

func (reconcileStubSyncService) AcknowledgeDevice(context.Context, string, int64) error { return nil }

func (reconcileStubSyncService) LastChangedAt(context.Context) (*int64, error) { return nil, nil }

// appendLineForTest appends one payload to a test data file.
func appendLineForTest(path string, payload []byte) (err error) {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := file.Close(); err == nil && closeErr != nil {
			err = closeErr
		}
	}()

	normalized := bytes.TrimRight(payload, "\r\n")
	if _, err := file.Write(normalized); err != nil {
		return err
	}
	if _, err := file.Write([]byte("\n")); err != nil {
		return err
	}

	return nil
}

// assertAnimeDataLines compares expected lines in a test data file.
func assertAnimeDataLines(t *testing.T, path string, want []string) {
	t.Helper()

	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read anime data file: %v", err)
	}

	got := splitAnimeDataLines(string(contents))
	if len(got) != len(want) {
		t.Fatalf("expected %d lines, got %d (%v)", len(want), len(got), got)
	}

	for i := range want {
		if !jsonLineEqual(t, got[i], want[i]) {
			t.Fatalf("expected line %d to be %s, got %s", i, want[i], got[i])
		}
	}
}

// splitAnimeDataLines returns non-empty anime data lines.
func splitAnimeDataLines(contents string) []string {
	lines := strings.Split(strings.ReplaceAll(contents, "\r\n", "\n"), "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		filtered = append(filtered, line)
	}
	return filtered
}

// writeAnimeDataFileForPatchTest writes lines for a patch integration test.
func writeAnimeDataFileForPatchTest(t *testing.T, filePath string, lines []string) {
	t.Helper()
	contents := []byte("")
	for _, line := range lines {
		contents = append(contents, []byte(line+"\n")...)
	}
	if err := os.WriteFile(filePath, contents, 0o600); err != nil {
		t.Fatalf("write anime data file: %v", err)
	}
}

// jsonLineEqual compares two JSON lines semantically.
func jsonLineEqual(t *testing.T, got string, want string) bool {
	t.Helper()

	var gotValue any
	if err := json.Unmarshal([]byte(got), &gotValue); err != nil {
		t.Fatalf("unmarshal got line: %v", err)
	}

	var wantValue any
	if err := json.Unmarshal([]byte(want), &wantValue); err != nil {
		t.Fatalf("unmarshal want line: %v", err)
	}

	return reflect.DeepEqual(gotValue, wantValue)
}
