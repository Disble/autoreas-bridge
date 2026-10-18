package sync

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"testing"
	"time"

	"autoreas-bridge/internal/events"
	sharedlogger "autoreas-bridge/internal/logger"
)

// seasonRow is one stored changelog row reduced to what a season publication writes.
type seasonRow struct {
	animeID  string
	fields   string
	snapshot string
	ts       int64
}

// projection is a settable SeasonProjectionSource for tests.
type projection struct {
	candidacies []SeasonCandidacy
	err         error
}

// read returns the current candidacies, or the configured failure.
func (p *projection) read(context.Context) ([]SeasonCandidacy, error) {
	return slices.Clone(p.candidacies), p.err
}

// grade returns a pointer to g.
func grade(g int) *int { return &g }

// newTestPublisher builds a publisher over db, source and a fixed clock.
func newTestPublisher(db *sql.DB, source *projection, nowMs int64) *SeasonProjectionPublisher {
	return NewSeasonProjectionPublisher(SeasonProjectionPublisherConfig{
		Provider: NewSQLiteProvider(db),
		Source:   source.read,
		Now:      func() time.Time { return time.UnixMilli(nowMs) },
	})
}

// seasonRows returns every stored changelog row in id order.
func seasonRows(t *testing.T, db *sql.DB) []seasonRow {
	t.Helper()

	result, err := db.Query(`SELECT anime_id, changed_fields_json, snapshot_json, changed_at_ms FROM changelog ORDER BY id`)
	if err != nil {
		t.Fatalf("query changelog: %v", err)
	}
	defer func() { _ = result.Close() }()
	var rows []seasonRow
	for result.Next() {
		var row seasonRow
		if err := result.Scan(&row.animeID, &row.fields, &row.snapshot, &row.ts); err != nil {
			t.Fatalf("scan changelog: %v", err)
		}
		rows = append(rows, row)
	}
	if err := result.Err(); err != nil {
		t.Fatalf("iterate changelog: %v", err)
	}
	return rows
}

// animeIDsOf returns the anime ids of rows, in order.
func animeIDsOf(rows []seasonRow) []string {
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.animeID)
	}
	return ids
}

// mustPublish publishes once and returns the anime ids that got a row.
func mustPublish(t *testing.T, publisher *SeasonProjectionPublisher) []string {
	t.Helper()

	published, err := publisher.Publish(context.Background())
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	return published
}

func TestSeasonProjectionPublisherRecordsOneSeasonRowPerChangedAnime(t *testing.T) {
	open := []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}, {AnimeID: "b", SeasonID: "s1", Grade: grade(4)}}
	cases := []struct {
		name string
		next []SeasonCandidacy
		want []string
	}{
		{name: "unchanged projection", next: open, want: nil},
		{name: "graded", next: []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1", Grade: grade(5)}, open[1]}, want: []string{"a"}},
		{name: "regraded", next: []SeasonCandidacy{open[0], {AnimeID: "b", SeasonID: "s1", Grade: grade(2)}}, want: []string{"b"}},
		{name: "grade cleared", next: []SeasonCandidacy{open[0], {AnimeID: "b", SeasonID: "s1"}}, want: []string{"b"}},
		{name: "ceased to be a candidate", next: open[1:], want: []string{"a"}},
		{name: "became a candidate", next: append(slices.Clone(open), SeasonCandidacy{AnimeID: "c", SeasonID: "s1"}), want: []string{"c"}},
		{name: "season closed", next: nil, want: []string{"a", "b"}},
		{name: "season replaced", next: []SeasonCandidacy{{AnimeID: "a", SeasonID: "s2"}, {AnimeID: "b", SeasonID: "s2", Grade: grade(4)}}, want: []string{"a", "b"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := openTestBridgeDB(t)
			for _, id := range []string{"a", "b", "c"} {
				storeSnapshot(t, db, id, 1)
			}
			source := &projection{candidacies: open}
			publisher := newTestPublisher(db, source, 1000)
			mustPublish(t, publisher)
			before := len(seasonRows(t, db))

			source.candidacies = tc.next
			published := mustPublish(t, publisher)

			added := seasonRows(t, db)[before:]
			if got := animeIDsOf(added); !slices.Equal(got, tc.want) {
				t.Fatalf("rows for %v, want %v", got, tc.want)
			}
			slices.Sort(published)
			if !slices.Equal(published, tc.want) {
				t.Fatalf("published %v, want %v", published, tc.want)
			}
			if again := mustPublish(t, publisher); len(again) != 0 {
				t.Fatalf("second publish of the same projection recorded %v", again)
			}
		})
	}
}

func TestSeasonProjectionPublisherBackfillsCurrentCandidatesWithTheirStoredSnapshot(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 3)
	storeSnapshot(t, db, "b", 7)
	publisher := newTestPublisher(db, &projection{candidacies: []SeasonCandidacy{
		{AnimeID: "b", SeasonID: "s1", Grade: grade(6)},
		{AnimeID: "a", SeasonID: "s1"},
	}}, 1000)

	mustPublish(t, publisher)

	rows := seasonRows(t, db)
	want := map[string]string{"a": string(snapshotAt("a", 3)), "b": string(snapshotAt("b", 7))}
	if len(rows) != len(want) {
		t.Fatalf("rows = %+v, want one per candidate", rows)
	}
	for _, row := range rows {
		if row.fields != `["season"]` {
			t.Fatalf("changed fields of %s = %s, want [\"season\"]", row.animeID, row.fields)
		}
		if row.snapshot != want[row.animeID] {
			t.Fatalf("snapshot of %s = %s, want the stored snapshot %s", row.animeID, row.snapshot, want[row.animeID])
		}
		if row.ts != 1000 {
			t.Fatalf("timestamp of %s = %d, want the clock 1000", row.animeID, row.ts)
		}
	}
}

func TestSeasonProjectionPublisherStampsPastTheAnimesLastRow(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	if err := NewChangelogStore(NewSQLiteProvider(db)).InsertPending(context.Background(), ChangelogEntry{
		AnimeID: "a", ChangedFields: []string{"episodesWatched"}, ChangedAtMs: 5000,
	}); err != nil {
		t.Fatalf("seed row: %v", err)
	}

	mustPublish(t, newTestPublisher(db, &projection{candidacies: []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}}}, 1000))

	rows := seasonRows(t, db)
	if len(rows) != 2 || rows[1].ts != 5001 {
		t.Fatalf("rows = %+v, want a season row stamped 5001", rows)
	}
}

func TestSeasonProjectionPublisherSkipsAnAnimeThatNoLongerExists(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	publisher := newTestPublisher(db, &projection{candidacies: []SeasonCandidacy{
		{AnimeID: "a", SeasonID: "s1"},
		{AnimeID: "gone", SeasonID: "s1"},
	}}, 1000)

	published := mustPublish(t, publisher)

	if got := animeIDsOf(seasonRows(t, db)); !slices.Equal(got, []string{"a"}) || !slices.Equal(published, []string{"a"}) {
		t.Fatalf("rows %v, published %v, want only the stored anime", got, published)
	}
	if again := mustPublish(t, publisher); len(again) != 0 {
		t.Fatalf("missing anime retried: %v", again)
	}
}

func TestSeasonProjectionPublisherWritesNothingWhenTheProjectionCannotBeRead(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	source := &projection{candidacies: []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}}, err: errors.New("season store down")}
	publisher := newTestPublisher(db, source, 1000)

	if _, err := publisher.Publish(context.Background()); err == nil {
		t.Fatal("publish succeeded on a failed read")
	}
	source.err = nil

	if published := mustPublish(t, publisher); !slices.Equal(published, []string{"a"}) {
		t.Fatalf("published %v after recovery, want [a]", published)
	}
}

func TestSeasonProjectionPublisherPublishesOnStartAndOnEverySignal(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	storeSnapshot(t, db, "b", 1)
	source := &projection{candidacies: []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}}}
	var notified [][]string
	bus := events.NewBus()
	publisher := NewSeasonProjectionPublisher(SeasonProjectionPublisherConfig{
		Provider:    NewSQLiteProvider(db),
		Source:      source.read,
		Now:         func() time.Time { return time.UnixMilli(1000) },
		OnPublished: func(_ context.Context, animeIDs []string) { notified = append(notified, animeIDs) },
	})

	publisher.Start(context.Background(), bus)
	defer publisher.Stop()
	source.candidacies = append(source.candidacies, SeasonCandidacy{AnimeID: "b", SeasonID: "s1"})
	bus.Publish(events.SeasonProjectionChangedEvent{})
	bus.Publish(events.SeasonProjectionChangedEvent{})

	if len(notified) != 2 || !slices.Equal(notified[0], []string{"a"}) || !slices.Equal(notified[1], []string{"b"}) {
		t.Fatalf("notified %v, want [[a] [b]] (start, first signal; the second signal changes nothing)", notified)
	}
}

func TestSeasonProjectionPublisherLogsAFailedPublicationAndStopsListening(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	source := &projection{err: errors.New("season store down")}
	log := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	bus := events.NewBus()
	publisher := NewSeasonProjectionPublisher(SeasonProjectionPublisherConfig{
		Provider: NewSQLiteProvider(db), Source: source.read, Log: log,
		Now: func() time.Time { return time.UnixMilli(1000) },
	})

	publisher.Start(context.Background(), bus)
	if entries := log.Recent(); len(entries) != 1 || entries[0].Level != sharedlogger.LevelError {
		t.Fatalf("log = %+v, want one error for the failed start pass", entries)
	}
	source.err, source.candidacies = nil, []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}}
	publisher.Stop()
	bus.Publish(events.SeasonProjectionChangedEvent{})

	if rows := seasonRows(t, db); len(rows) != 0 {
		t.Fatalf("a stopped publisher recorded %+v", rows)
	}
}

func TestSeasonProjectionPublisherWithoutOptionalHooksStillPublishes(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	source := &projection{err: errors.New("season store down")}
	publisher := newTestPublisher(db, source, 1000)

	publisher.Start(context.Background(), events.NewBus())
	defer publisher.Stop()
	source.err, source.candidacies = nil, []SeasonCandidacy{{AnimeID: "a", SeasonID: "s1"}}
	publisher.publishAndNotify(context.Background())

	if got := animeIDsOf(seasonRows(t, db)); !slices.Equal(got, []string{"a"}) {
		t.Fatalf("rows %v, want [a]", got)
	}
}

func TestSeasonProjectionPublisherFailsOnAnUnreadablePublishedProjection(t *testing.T) {
	db := openTestBridgeDB(t)
	storeSnapshot(t, db, "a", 1)
	if _, err := db.Exec(`INSERT INTO season_projection_published (anime_id, season_id, grade) VALUES ('a', 's1', 'not a grade')`); err != nil {
		t.Fatalf("seed unreadable row: %v", err)
	}

	if _, err := newTestPublisher(db, &projection{}, 1000).Publish(context.Background()); err == nil {
		t.Fatal("publish succeeded over an unreadable published projection")
	}
	if rows := seasonRows(t, db); len(rows) != 0 {
		t.Fatalf("recorded %+v over an unreadable published projection", rows)
	}
}
