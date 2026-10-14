package announce

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/testsupport/sqlitedb"
)

// snapshotsStub answers snapshots from a map; an id in missing is not found, an id in failing errors.
type snapshotsStub struct {
	payloads map[string]string
	failing  map[string]bool
}

func (s snapshotsStub) Snapshot(_ context.Context, animeID string) ([]byte, error) {
	if s.failing[animeID] {
		return nil, errors.New("snapshot read failed")
	}
	payload, ok := s.payloads[animeID]
	if !ok {
		return nil, fmt.Errorf("anime %s: %w", animeID, contracts.ErrAnimeNotFound)
	}
	return []byte(payload), nil
}

// logRecorder keeps every entry logged, by level.
type logRecorder struct {
	mu      sync.Mutex
	entries []string
}

func (l *logRecorder) Debugf(string, string, ...any) {}
func (l *logRecorder) Infof(string, string, ...any)  {}
func (l *logRecorder) Warnf(string, string, ...any)  {}
func (l *logRecorder) Errorf(string, string, ...any) {}
func (l *logRecorder) Logf(_ string, level string, fields logger.Fields, format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, level+" "+fields.EventType+" "+fmt.Sprintf(format, args...))
}

// levels returns the level of every logged entry, in order.
func (l *logRecorder) levels() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	levels := make([]string, len(l.entries))
	for i, entry := range l.entries {
		levels[i], _, _ = strings.Cut(entry, " ")
	}
	return levels
}

// busSpy records every event published, by name.
type busSpy struct {
	events.Bus
	mu        sync.Mutex
	published []events.Event
}

// newBusSpy returns a spy over a real synchronous bus.
func newBusSpy() *busSpy { return &busSpy{Bus: events.NewBus()} }

func (b *busSpy) Publish(event events.Event) {
	b.mu.Lock()
	b.published = append(b.published, event)
	b.mu.Unlock()
	b.Bus.Publish(event)
}

// all returns every event published so far.
func (b *busSpy) all() []events.Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]events.Event(nil), b.published...)
}

// storeWithMarks returns a real store with one stored duration, and so one pending mark, per anime.
func storeWithMarks(t *testing.T, animeIDs ...string) *episodes.Store {
	t.Helper()

	db := sqlitedb.Open(t, episodes.SchemaTables()...)
	ms := int64(0)
	store := episodes.NewStore(db, func() time.Time { ms++; return time.UnixMilli(ms) })
	for _, id := range animeIDs {
		if _, err := store.FillGaps(context.Background(), id, []episodes.Reading{{Episode: 1, DurationMS: 1000}}); err != nil {
			t.Fatalf("fill %s: %v", id, err)
		}
	}
	return store
}

// pendingIDs lists the anime still marked pending announce.
func pendingIDs(t *testing.T, store *episodes.Store) []string {
	t.Helper()

	pending, err := store.PendingAnnounce(context.Background())
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	ids := make([]string, len(pending))
	for i, p := range pending {
		ids[i] = p.AnimeID
	}
	return ids
}

func TestAnnouncePublishesEachPendingAnimeOnceAndClearsItsMark(t *testing.T) {
	t.Parallel()

	store := storeWithMarks(t, "a", "b")
	marks, err := store.PendingAnnounce(context.Background())
	if err != nil {
		t.Fatalf("pending: %v", err)
	}
	bus := newBusSpy()
	animeChanged := 0
	bus.Subscribe(events.EventNameAnimeChanged, func(events.Event) { animeChanged++ })

	New(Deps{Pending: store, Snapshots: snapshotsStub{payloads: map[string]string{"a": `{"_id":"a"}`, "b": `{"_id":"b"}`}},
		Bus: bus}).Announce(context.Background())

	published := bus.all()
	if len(published) != 2 {
		t.Fatalf("want one event per pending anime, got %v", published)
	}
	for i, want := range []string{"a", "b"} {
		got, ok := published[i].(events.EpisodeDurationsChangedEvent)
		if !ok {
			t.Fatalf("event %d: want EpisodeDurationsChangedEvent, got %T", i, published[i])
		}
		if got.AnimeID != want || string(got.Payload) != `{"_id":"`+want+`"}` || got.EventID != EventID(marks[i]) {
			t.Errorf("event %d: want %s with its snapshot and id %s, got %+v", i, want, EventID(marks[i]), got)
		}
	}
	if animeChanged != 0 {
		t.Errorf("announcing durations must publish no AnimeChangedEvent, got %d", animeChanged)
	}
	if ids := pendingIDs(t, store); len(ids) != 0 {
		t.Errorf("every announced mark must be cleared, got %v", ids)
	}
}

func TestEventIDIsStablePerMark(t *testing.T) {
	t.Parallel()

	got := EventID(episodes.Pending{AnimeID: "a", MarkedAtMS: 42})
	if got != "episode.durations_changed:a:42" {
		t.Fatalf("event id: got %q", got)
	}
	if EventID(episodes.Pending{AnimeID: "a", MarkedAtMS: 43}) == got {
		t.Error("a renewed mark must get a new event id")
	}
}

func TestAnnounceClearsTheMarkOfAMissingAnimeWithoutAnEvent(t *testing.T) {
	t.Parallel()

	store := storeWithMarks(t, "gone")
	bus := newBusSpy()

	New(Deps{Pending: store, Snapshots: snapshotsStub{}, Bus: bus}).Announce(context.Background())

	if published := bus.all(); len(published) != 0 {
		t.Errorf("a missing anime has nothing to announce, got %v", published)
	}
	if ids := pendingIDs(t, store); len(ids) != 0 {
		t.Errorf("a missing anime's mark must be cleared, got %v", ids)
	}
}

func TestAnnounceKeepsTheMarkOfAFailedSnapshotAndGoesOn(t *testing.T) {
	t.Parallel()

	store := storeWithMarks(t, "broken", "ok")
	bus := newBusSpy()
	log := &logRecorder{}

	New(Deps{Pending: store, Bus: bus, Logger: log, Snapshots: snapshotsStub{
		payloads: map[string]string{"ok": `{}`}, failing: map[string]bool{"broken": true},
	}}).Announce(context.Background())

	published := bus.all()
	if len(published) != 1 || published[0].(events.EpisodeDurationsChangedEvent).AnimeID != "ok" {
		t.Fatalf("the other anime must still be announced, got %v", published)
	}
	if ids := pendingIDs(t, store); len(ids) != 1 || ids[0] != "broken" {
		t.Errorf("a failed read must keep its mark for a later pass, got %v", ids)
	}
	if levels := log.levels(); len(levels) != 1 || levels[0] != logger.LevelWarn {
		t.Errorf("want one warning, got %v", log.entries)
	}
}

// pendingStub fails on demand.
type pendingStub struct {
	marks    []episodes.Pending
	readErr  error
	clearErr error
	cleared  []episodes.Pending
}

func (p *pendingStub) PendingAnnounce(context.Context) ([]episodes.Pending, error) {
	return p.marks, p.readErr
}

func (p *pendingStub) ClearPending(_ context.Context, mark episodes.Pending) error {
	p.cleared = append(p.cleared, mark)
	return p.clearErr
}

func TestAnnounceLogsAFailedPendingRead(t *testing.T) {
	t.Parallel()

	bus := newBusSpy()
	log := &logRecorder{}

	New(Deps{Pending: &pendingStub{readErr: errors.New("closed")}, Snapshots: snapshotsStub{}, Bus: bus,
		Logger: log}).Announce(context.Background())

	if len(bus.all()) != 0 {
		t.Error("nothing can be announced without the pending list")
	}
	if levels := log.levels(); len(levels) != 1 || levels[0] != logger.LevelWarn {
		t.Errorf("want one warning, got %v", log.entries)
	}
}

func TestAnnounceLogsAFailedClear(t *testing.T) {
	t.Parallel()

	pending := &pendingStub{marks: []episodes.Pending{{AnimeID: "a", MarkedAtMS: 1}}, clearErr: errors.New("closed")}
	log := &logRecorder{}

	New(Deps{Pending: pending, Snapshots: snapshotsStub{payloads: map[string]string{"a": `{}`}}, Bus: newBusSpy(),
		Logger: log}).Announce(context.Background())

	if len(pending.cleared) != 1 {
		t.Errorf("the clear must be attempted, got %v", pending.cleared)
	}
	if levels := log.levels(); len(levels) != 1 || levels[0] != logger.LevelWarn {
		t.Errorf("want one warning, got %v", log.entries)
	}
}

func TestAnnounceStopsBetweenAnimeWhenCancelled(t *testing.T) {
	t.Parallel()

	pending := &pendingStub{marks: []episodes.Pending{{AnimeID: "a", MarkedAtMS: 1}, {AnimeID: "b", MarkedAtMS: 2}}}
	ctx, cancel := context.WithCancel(context.Background())
	bus := newBusSpy()
	bus.Subscribe(events.EventNameEpisodeDurationsChanged, func(events.Event) { cancel() })

	New(Deps{Pending: pending, Snapshots: snapshotsStub{payloads: map[string]string{"a": `{}`, "b": `{}`}},
		Bus: bus}).Announce(ctx)

	if published := bus.all(); len(published) != 1 {
		t.Errorf("a cancelled pass must stop before the next anime, got %v", published)
	}
}
