package anime_test

import (
	"context"
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

// openAnimeServiceTestStore opens the SQLite store used by anime tests.
func openAnimeServiceTestStore(t *testing.T) *bridgeSync.AnimeSnapshotStore {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return bridgeSync.NewAnimeSnapshotStore(db)
}

// seedAnimeSnapshot inserts a snapshot fixture into the test store.
func seedAnimeSnapshot(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string) {
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
func seedAnimeSnapshotWithModifiedAt(t *testing.T, store *bridgeSync.AnimeSnapshotStore, animeID string, payload string, modifiedAt int64) {
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

// floatPtr returns a pointer to a float test value.
func floatPtr(value float64) *float64 { return &value }

// int64Ptr returns a pointer to an int64 test value.
func int64Ptr(value int64) *int64 { return &value }

// stubAnimeWriter is the Writer test double.
//
// SDD-55 Slice B: the gateway no longer routes writes through Writer at all
// (persist() finalizes straight into SQLite -- ADR-55-1/ADR-55-3), so
// RequestWrite is never called by production code anymore. Tests that used
// to assert `.calls`/`.payload`/`.animeID` after a write now assert against
// the SQLite snapshot store instead (see openAnimeServiceTestStore /
// seedAnimeSnapshot and the per-test snapshot lookups).
type stubAnimeWriter struct {
	animeID string
	payload []byte
	err     error
	calls   int
	onWrite func()
}

func (s *stubAnimeWriter) RequestWrite(_ context.Context, animeID string, payload []byte) error {
	if s.onWrite != nil {
		s.onWrite()
	}
	s.calls++
	s.animeID = animeID
	s.payload = append([]byte(nil), payload...)
	return s.err
}

// assertNoPendingAnimeChanged verifies that no anime change remains pending.
func assertNoPendingAnimeChanged(t *testing.T, store *bridgeSync.AnimeSnapshotStore) {
	t.Helper()
	outbox, ok := store.WriteBaseStore().(interface {
		ListPendingAnimeChanged(context.Context) ([]anime.ChangedOutboxEvent, error)
	})
	if !ok {
		t.Fatal("test store does not expose the anime.changed outbox")
	}
	pending, err := outbox.ListPendingAnimeChanged(context.Background())
	if err != nil {
		t.Fatalf("ListPendingAnimeChanged: %v", err)
	}
	if len(pending) != 0 {
		t.Fatalf("pending anime.changed events = %+v, want none", pending)
	}
}
