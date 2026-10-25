package anime_test

import (
	"bytes"
	"context"
	"reflect"
	"testing"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	bridgeSync "autoreas-bridge/internal/sync"
)

// snapshotOnlyLookup is a snapshot store with no durable write-base journal.
type snapshotOnlyLookup struct{}

func (snapshotOnlyLookup) GetSnapshot(context.Context, string) (anime.SnapshotRecord, error) {
	return anime.SnapshotRecord{}, nil
}

func (snapshotOnlyLookup) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return map[string]anime.SnapshotRecord{}, nil
}

// TestWriteServiceRecoveryNeedsAWriteJournalAndAPublisher pins the recovery
// gate: recovery runs only when there is a journal to replay AND a publisher to
// announce what it replays.
func TestWriteServiceRecoveryNeedsAWriteJournalAndAPublisher(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		service   func(t *testing.T) *anime.WriteService
		configure bool
	}{
		{"journal and publisher", func(t *testing.T) *anime.WriteService {
			return anime.NewWriteService(openAnimeServiceTestStore(t), &stubCommittedPublisher{})
		}, true},
		{"journal without publisher", func(t *testing.T) *anime.WriteService {
			return anime.NewWriteService(openAnimeServiceTestStore(t), nil)
		}, false},
		{"publisher without journal", func(*testing.T) *anime.WriteService {
			return anime.NewWriteService(snapshotOnlyLookup{}, &stubCommittedPublisher{})
		}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := tc.service(t).RecoveryConfigured(); got != tc.configure {
				t.Fatalf("expected RecoveryConfigured %v, got %v", tc.configure, got)
			}
		})
	}
}

// TestEditorServiceAnnouncesASaveThroughTheCommittedPublisher proves that
// without an injected bus publisher, an editor save is announced once through
// the committed publisher -- the production wiring.
func TestEditorServiceAnnouncesASaveThroughTheCommittedPublisher(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","status":0,"active":true}`, 1000)
	publisher := &stubCommittedPublisher{}
	service := anime.NewEditorService(store, publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	total := 28

	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{
		TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Value: total},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("save editor patch: result=%+v err=%v", result, err)
	}
	assertSingleCommittedUpdate(t, publisher, "anime-editor")
}

// TestScheduleServiceAnnouncesAnApplyThroughTheCommittedPublisher proves the
// same production wiring for a schedule draft.
func TestScheduleServiceAnnouncesAnApplyThroughTheCommittedPublisher(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-a", `{"id":"anime-a","name":"A","active":true,"days":[{"day":"Lunes","order":1}]}`, 101)
	publisher := &stubCommittedPublisher{}
	service := anime.NewScheduleService(anime.NewQueryService(store), publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(1710000000123).UTC() })

	result, err := service.Apply(ctx, anime.ApplyAnimeScheduleDraftCommand{BoardModifiedAt: 101, Entries: []anime.ApplyAnimeScheduleDraftEntry{
		{AnimeID: "anime-a", BaseModifiedAt: 101, Placements: []contracts.MobileAnimeDay{{Day: "Viernes", Order: 1}}},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("apply schedule draft: result=%+v err=%v", result, err)
	}
	assertSingleCommittedUpdate(t, publisher, "anime-a")
}

// assertSingleCommittedUpdate fails unless exactly one update for animeID was published.
func assertSingleCommittedUpdate(t *testing.T, publisher *stubCommittedPublisher, animeID string) {
	t.Helper()
	if len(publisher.published) != 1 {
		t.Fatalf("expected one committed publication, got %d", len(publisher.published))
	}
	if event := publisher.published[0]; event.AnimeID != animeID || event.ChangeType != "update" {
		t.Fatalf("expected an update event for %q, got %#v", animeID, event)
	}
}

// TestProductionWiringRecordsOneChangelogRowAndOneBusEventPerSave is the write
// path referee: over a real database, the production publisher and the real
// changelog recorder, one save leaves exactly one changelog row and one
// anime.changed event whose change type, changed fields and payload are what a
// consumer (mobile reconcile, the WS hub) observes.
func TestProductionWiringRecordsOneChangelogRowAndOneBusEventPerSave(t *testing.T) {
	cases := []struct {
		name       string
		write      refereeWrite
		changeType string
		fields     []string
	}{
		{"editor update", writeRefereeEditorUpdate, events.AnimeChangeTypeUpdate, []string{"totalEpisodes"}},
		// A first write lists every non-null field except the id it was synthesized with.
		{"first write", writeRefereeFirstWrite, events.AnimeChangeTypeCreate,
			[]string{"active", "cover", "createdAt", "days", "episodesWatched", "firstCycle", "name", "sourceUrl", "status"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			db := openAnimeServiceTestDB(t)
			store := bridgeSync.NewAnimeSnapshotStore(db)
			bus := events.NewBus()
			changelog := bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(db))
			recorder := bridgeSync.NewChangelogRecorder(bus, changelog)
			recorder.Start(ctx)
			t.Cleanup(recorder.Stop)
			var published []events.AnimeChangedEvent
			t.Cleanup(bus.Subscribe(events.EventNameAnimeChanged, func(event events.Event) {
				published = append(published, event.(events.AnimeChangedEvent))
			}))

			animeID := tc.write(t, ctx, store, anime.NewCommittedPublisher(bus))

			snapshot, err := store.GetSnapshot(ctx, animeID)
			if err != nil {
				t.Fatalf("get snapshot: %v", err)
			}
			assertRefereeEvent(t, published, animeID, tc.changeType, tc.fields, snapshot.CanonicalJSON)
			assertRefereeChangelogRow(t, ctx, changelog, animeID, tc.changeType, tc.fields, snapshot.CanonicalJSON)
		})
	}
}

// refereeWrite performs one save through a public service and returns the anime it wrote.
type refereeWrite func(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, publisher anime.CommittedPublisher) string

// writeRefereeEditorUpdate saves one editor field change on a seeded anime.
func writeRefereeEditorUpdate(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, publisher anime.CommittedPublisher) string {
	t.Helper()
	seedAnimeSnapshotWithModifiedAt(t, store, "anime-editor", `{"id":"anime-editor","name":"Frieren","status":0,"active":true,"totalEpisodes":12}`, 1000)
	service := anime.NewEditorService(store, publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	result, err := service.Save(ctx, anime.SaveAnimeEditorCommand{AnimeID: "anime-editor", BaseModifiedAt: 1000, Patch: anime.EditorPatch{
		TotalEpisodes: anime.EditorNullableIntPatch{Present: true, Value: 28},
	}})
	if err != nil || result.Outcome != anime.PatchOutcomeApplied {
		t.Fatalf("save editor patch: result=%+v err=%v", result, err)
	}
	return "anime-editor"
}

// writeRefereeFirstWrite creates a new anime, the write that produces a create change.
func writeRefereeFirstWrite(t *testing.T, ctx context.Context, store *bridgeSync.AnimeSnapshotStore, publisher anime.CommittedPublisher) string {
	t.Helper()
	service := anime.NewWriteService(store, publisher)
	service.SetNow(func() time.Time { return time.UnixMilli(2000).UTC() })
	id, err := service.CreateAnime(ctx, contracts.AnimeCreate{ID: "anime-new", Nombre: "Dandadan", Pagina: "https://example.test/dandadan", Dias: []contracts.Placement{{Day: "Sin ver", Order: 1}}})
	if err != nil || id != "anime-new" {
		t.Fatalf("create anime: id=%q err=%v", id, err)
	}
	return id
}

// assertRefereeEvent fails unless exactly one anime.changed event carries the
// expected change type, changed fields and the stored payload.
func assertRefereeEvent(t *testing.T, published []events.AnimeChangedEvent, animeID, changeType string, fields []string, payload []byte) {
	t.Helper()
	if len(published) != 1 {
		t.Fatalf("expected one anime.changed event, got %d", len(published))
	}
	if event := published[0]; event.AnimeID != animeID || event.ChangeType != changeType ||
		!bytes.Equal(event.Payload, payload) || !reflect.DeepEqual(event.ChangedFields, fields) {
		t.Fatalf("expected %s event for %q with fields %v and the stored payload, got %+v (payload %s)", changeType, animeID, fields, event, event.Payload)
	}
}

// assertRefereeChangelogRow fails unless the changelog holds exactly one row
// with the expected change type, changed fields and the stored snapshot.
func assertRefereeChangelogRow(t *testing.T, ctx context.Context, changelog *bridgeSync.ChangelogStore, animeID, changeType string, fields []string, snapshot []byte) {
	t.Helper()
	rows, err := changelog.ListAfterID(ctx, 0)
	if err != nil || len(rows) != 1 {
		t.Fatalf("expected exactly one changelog row: %+v, %v", rows, err)
	}
	if row := rows[0]; row.AnimeID != animeID || row.ChangeType != changeType || !reflect.DeepEqual(row.ChangedFields, fields) ||
		!bytes.Equal(row.SnapshotJSON, snapshot) {
		t.Fatalf("expected %s changelog row for %q with fields %v, got %+v", changeType, animeID, fields, row)
	}
}
