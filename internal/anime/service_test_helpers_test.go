package anime_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/notification"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// decodeAnimeDomain decodes a test payload into the domain anime model.
func decodeAnimeDomain(t *testing.T, payload []byte) domain.Anime {
	t.Helper()
	value, _, err := store.Decode(payload)
	if err != nil {
		t.Fatalf("decode anime payload: %v", err)
	}
	return value
}

// decodeJSONFields decodes a test payload into raw JSON fields.
func decodeJSONFields(t *testing.T, payload []byte) map[string]json.RawMessage {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("decode JSON fields: %v", err)
	}
	return fields
}

// jsonValueEqual compares two JSON values for test assertions.
func jsonValueEqual(t *testing.T, got, want []byte) bool {
	t.Helper()

	var gotValue, wantValue any
	if err := json.Unmarshal(got, &gotValue); err != nil {
		t.Fatalf("unmarshal got json: %v", err)
	}
	if err := json.Unmarshal(want, &wantValue); err != nil {
		t.Fatalf("unmarshal want json: %v", err)
	}

	return reflect.DeepEqual(gotValue, wantValue)
}

type stubConflictWriter struct {
	inserted []contracts.ConflictRecord
	err      error
}

func (s *stubConflictWriter) InsertConflict(_ context.Context, record contracts.ConflictRecord) error {
	s.inserted = append(s.inserted, record)
	return s.err
}

type stubNotifier struct {
	notifications []notification.Notification
	err           error
}

func (s *stubNotifier) Notify(_ context.Context, n notification.Notification) error {
	s.notifications = append(s.notifications, n)
	return s.err
}

// openAnimeServiceTestDB opens the bootstrapped SQLite database backing the
// anime service tests. openAnimeServiceTestStore wraps it for tests that only
// need the snapshot store; tests that also need a real watchhistory.Store
// (e.g. the repeat/cycle-reset tests) call this directly instead of opening a
// second database.
func openAnimeServiceTestDB(t *testing.T) *sql.DB {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	return db
}

// openAnimeServiceTestStore opens the SQLite store used by anime tests.
func openAnimeServiceTestStore(t *testing.T) *bridgeSync.AnimeSnapshotStore {
	t.Helper()
	return bridgeSync.NewAnimeSnapshotStore(openAnimeServiceTestDB(t))
}

// seedAnimeSnapshot inserts a snapshot fixture into the test store.
func seedAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID, payload string) {
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

// seedAnimeSnapshotWithModifiedAt inserts a snapshot fixture with an OCC token.
func seedAnimeSnapshotWithModifiedAt(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID, payload string, modifiedAt int64) {
	t.Helper()

	records := map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          anime.HashSnapshot([]byte(payload)),
			ModifiedAt:    modifiedAt,
		},
	}
	if err := store.ReplaceBaseline(context.Background(), records, nil); err != nil {
		t.Fatalf("seed anime snapshot with modified_at: %v", err)
	}
}

// stubCommittedPublisher is the CommittedPublisher test double. It records
// every committed change it was asked to publish; writes themselves are
// asserted against the SQLite snapshot store (see openAnimeServiceTestStore).
type stubCommittedPublisher struct {
	published []anime.CommittedChange
}

func (s *stubCommittedPublisher) PublishCommitted(event anime.CommittedChange) {
	s.published = append(s.published, event)
}

// stubWatchRecorder is the anime.WatchRecorder test double.
type stubWatchRecorder struct {
	calls []watchhistory.Change
	err   error
}

func (s *stubWatchRecorder) RecordWatch(_ context.Context, change watchhistory.Change) error {
	s.calls = append(s.calls, change)
	return s.err
}
