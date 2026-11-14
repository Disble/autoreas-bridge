package dbstall

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// sampleHeader is one stall's header as the hung process writes it.
func sampleHeader(id string) Header {
	return Header{
		ID:           id,
		OccurredAtMS: 1_794_544_000_000,
		Route:        "/api/status",
		Pool:         PoolStats{MaxOpen: 1, InUse: 1, WaitCount: 7, WaitDurationMS: 9_000},
	}
}

// readFile returns one evidence file's contents, failing the test when it is missing.
func readFile(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(content)
}

func TestWriteThenReadPendingRoundTripsHeaderAndDump(t *testing.T) {
	t.Parallel()
	dir := filepath.Join(t.TempDir(), "logs")

	if err := Write(dir, sampleHeader("stall-1"), []byte("goroutine 1 [running]:\nmain.main()\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	pending, ok, err := ReadPending(dir)
	if err != nil || !ok {
		t.Fatalf("expected a pending stall, got ok=%v err=%v", ok, err)
	}
	if !reflect.DeepEqual(pending.Header, sampleHeader("stall-1")) {
		t.Fatalf("expected header %#v, got %#v", sampleHeader("stall-1"), pending.Header)
	}
	if string(pending.Dump) != "goroutine 1 [running]:\nmain.main()\n" {
		t.Fatalf("expected the dump after the header line, got %q", pending.Dump)
	}
}

func TestReadPendingWithoutAFileHasNothingPending(t *testing.T) {
	t.Parallel()

	_, ok, err := ReadPending(t.TempDir())

	if ok || err != nil {
		t.Fatalf("expected nothing pending and no error, got ok=%v err=%v", ok, err)
	}
}

func TestReadPendingRefusesAnUnreadableHeader(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, PendingFile), []byte("not json\nrest"), 0o600); err != nil {
		t.Fatalf("seed: %v", err)
	}

	_, ok, err := ReadPending(dir)

	if !ok || err == nil {
		t.Fatalf("expected a pending file with a header error, got ok=%v err=%v", ok, err)
	}
}

// TestRotationKeepsThePendingFileAndFiveOlderOnes pins the Ollama-style chain:
// each rotation shifts db-stall.log to -1, -1 to -2 and so on, and drops -5.
func TestRotationKeepsThePendingFileAndFiveOlderOnes(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	for i := 1; i <= MaxRotated+2; i++ {
		if err := Write(dir, sampleHeader(fmt.Sprintf("stall-%d", i)), []byte("dump\n")); err != nil {
			t.Fatalf("write %d: %v", i, err)
		}
	}
	if err := Rotate(dir); err != nil {
		t.Fatalf("rotate: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	if len(entries) != MaxRotated {
		t.Fatalf("expected %d files after the pending one rotated out, got %d", MaxRotated, len(entries))
	}
	if _, err := os.Stat(filepath.Join(dir, PendingFile)); !os.IsNotExist(err) {
		t.Fatalf("expected no pending file after rotation, got %v", err)
	}
	newest := readFile(t, filepath.Join(dir, "db-stall-1.log"))
	oldest := readFile(t, filepath.Join(dir, "db-stall-5.log"))
	if !strings.Contains(newest, `"id":"stall-7"`) || !strings.Contains(oldest, `"id":"stall-3"`) {
		t.Fatalf("expected -1 to hold stall-7 and -5 stall-3, got %q and %q", newest, oldest)
	}
}

func TestRotateWithoutAPendingFileLeavesOlderFilesInPlace(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := Write(dir, sampleHeader("stall-1"), []byte("dump\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := Rotate(dir); err != nil {
		t.Fatalf("first rotate: %v", err)
	}

	if err := Rotate(dir); err != nil {
		t.Fatalf("second rotate: %v", err)
	}

	if !strings.Contains(readFile(t, filepath.Join(dir, "db-stall-1.log")), `"id":"stall-1"`) {
		t.Fatal("expected a rotation with nothing pending to keep db-stall-1.log")
	}
}

// stallDump is a goroutine dump in the debug=2 shape: a holder inside a write
// transaction, two victims parked waiting for the connection, the dumping
// goroutine itself, and a runtime goroutine with no Bridge frame.
const stallDump = `goroutine 1 [running]:
runtime/pprof.writeGoroutineStacks(...)
	C:/go/src/runtime/pprof/pprof.go:700 +0x1
autoreas-bridge/internal/desktop.(*stallEvidence).record(0xc000)
	D:/bridge/internal/desktop/app_db_stall.go:80 +0x2

goroutine 40 [select, 45 minutes]:
database/sql.(*DB).conn(0xc001, {0x1, 0x2}, 0x1)
	C:/go/src/database/sql/sql.go:1305 +0x3
autoreas-bridge/internal/device.(*SQLiteStore).FindByAuthToken(0xc002, {0x1, 0x2}, {0x3, 0x4})
	D:/bridge/internal/device/sqlite_store.go:110 +0x4

goroutine 12 [chan receive, 46 minutes]:
autoreas-bridge/internal/anime/episodes.(*Backfill).wait(...)
	D:/bridge/internal/anime/episodes/backfill.go:90 +0x5
autoreas-bridge/internal/persistence.InWriteTx.func1()
	D:/bridge/internal/persistence/write_tx.go:40 +0x6
autoreas-bridge/internal/persistence.InWriteTx({0x1, 0x2}, 0xc003, 0xc004)
	D:/bridge/internal/persistence/write_tx.go:30 +0x7
autoreas-bridge/internal/anime/episodes.(*Backfill).Run(0xc005)
	D:/bridge/internal/anime/episodes/backfill.go:60 +0x8
autoreas-bridge/internal/desktop.(*App).startEpisodeBackfill.func1()
	D:/bridge/internal/desktop/app_episode_backfill.go:20 +0x9
created by autoreas-bridge/internal/desktop.(*App).startEpisodeBackfill in goroutine 1
	D:/bridge/internal/desktop/app_episode_backfill.go:18 +0xa

goroutine 41 [select, 2 minutes]:
database/sql.(*DB).conn(0xc001, {0x1, 0x2}, 0x1)
	C:/go/src/database/sql/sql.go:1305 +0x3
autoreas-bridge/internal/observability/eventlog.(*SQLiteStore).InsertEvent(0xc006, {0x1, 0x2}, {0x3})
	D:/bridge/internal/observability/eventlog/store.go:46 +0xb

goroutine 7 [IO wait]:
internal/poll.runtime_pollWait(0x1, 0x72)
	C:/go/src/runtime/netpoll.go:351 +0xc

goroutine 15 [sync.Mutex.Lock]:
autoreas-bridge/internal/logger.(*StdoutLogger).Logf(0xc007)
	D:/bridge/internal/logger/stdout.go:51 +0xd
`

func TestSuspectsKeepBridgeGoroutinesThatAreNotWaitingForTheConnection(t *testing.T) {
	t.Parallel()

	suspects := Suspects([]byte(stallDump))

	want := []Suspect{
		{Goroutine: 12, State: "chan receive", WaitMinutes: 46, Frames: []string{
			"anime/episodes.(*Backfill).wait", "persistence.InWriteTx.func1", "persistence.InWriteTx", "anime/episodes.(*Backfill).Run",
		}},
		{Goroutine: 15, State: "sync.Mutex.Lock", Frames: []string{"logger.(*StdoutLogger).Logf"}},
	}
	if !reflect.DeepEqual(suspects, want) {
		t.Fatalf("expected suspects %#v, got %#v", want, suspects)
	}
}

func TestMetadataCarriesTheHeaderAndSuspects(t *testing.T) {
	t.Parallel()
	suspects := []Suspect{
		{Goroutine: 12, State: "chan receive", WaitMinutes: 46, Frames: []string{"persistence.InWriteTx"}},
		{Goroutine: 13, State: "select", WaitMinutes: 1, Frames: []string{"sync.(*Service).Run"}},
		{Goroutine: 15, State: "sync.Mutex.Lock", Frames: []string{"logger.(*StdoutLogger).Logf"}},
	}

	metadata := sampleHeader("stall-1").Metadata(suspects, 4096)

	// A goroutine blocked under a minute carries no wait time, so none is written.
	want := map[string]any{
		"route": "/api/status", "poolMaxOpen": 1, "poolInUse": 1, "poolIdle": 0,
		"poolWaitCount": int64(7), "poolWaitDurationMs": int64(9_000), "suspectsFound": 3,
		"suspects": []map[string]any{
			{"goroutine": 12, "state": "chan receive", "waitMinutes": 46, "frames": []string{"persistence.InWriteTx"}},
			{"goroutine": 13, "state": "select", "waitMinutes": 1, "frames": []string{"sync.(*Service).Run"}},
			{"goroutine": 15, "state": "sync.Mutex.Lock", "frames": []string{"logger.(*StdoutLogger).Logf"}},
		},
	}
	if !reflect.DeepEqual(metadata, want) {
		t.Fatalf("expected metadata %#v, got %#v", want, metadata)
	}
}

func TestMetadataStopsAddingSuspectsAtTheByteBound(t *testing.T) {
	t.Parallel()
	suspects := make([]Suspect, 60)
	for i := range suspects {
		suspects[i] = Suspect{Goroutine: i, State: "select", WaitMinutes: 60 - i, Frames: []string{
			"anime/episodes.(*Backfill).someLongFunctionName", "persistence.InWriteTx.func1", "persistence.InWriteTx",
		}}
	}

	metadata := sampleHeader("stall-1").Metadata(suspects, 4096)

	encoded, err := json.Marshal(metadata)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	kept, _ := metadata["suspects"].([]map[string]any)
	if len(encoded) > 4096 || metadata["suspectsTruncated"] != true || len(kept) == 0 || len(kept) == len(suspects) {
		t.Fatalf("expected a truncated, non-empty suspect list within 4096 bytes, got %d bytes, %d kept, truncated=%v",
			len(encoded), len(kept), metadata["suspectsTruncated"])
	}
	if kept[0]["goroutine"] != 0 || metadata["suspectsFound"] != len(suspects) {
		t.Fatalf("expected the first suspects kept in order and every suspect counted, got %#v", metadata)
	}
}

// TestMetadataKeepsSuspectsInOrderAndStopsAtTheFirstThatDoesNotFit pins the
// prefix rule: a later, smaller suspect never jumps over one that did not fit,
// because suspects are ordered by how long they have been blocked.
func TestMetadataKeepsSuspectsInOrderAndStopsAtTheFirstThatDoesNotFit(t *testing.T) {
	t.Parallel()
	small := func(goroutine int) Suspect {
		return Suspect{Goroutine: goroutine, State: "select", Frames: []string{"a.b"}}
	}
	huge := Suspect{Goroutine: 2, State: "select", Frames: []string{strings.Repeat("x", 600)}}
	header := sampleHeader("stall-1")
	fitsTwoSmall, err := json.Marshal(header.Metadata([]Suspect{small(1), small(3)}, 1<<20))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	metadata := header.Metadata([]Suspect{small(1), huge, small(3)}, len(fitsTwoSmall)+40)

	kept, _ := metadata["suspects"].([]map[string]any)
	if len(kept) != 1 || kept[0]["goroutine"] != 1 || metadata["suspectsTruncated"] != true {
		t.Fatalf("expected only the first suspect kept and the rest marked truncated, got %#v", metadata)
	}
}

// TestMetadataKeepsASuspectThatFillsTheBoundExactly pins the bound as inclusive:
// metadata of exactly maxBytes still fits a runtime_events row.
func TestMetadataKeepsASuspectThatFillsTheBoundExactly(t *testing.T) {
	t.Parallel()
	suspects := []Suspect{{Goroutine: 1, State: "select", Frames: []string{"a.b"}}}
	header := sampleHeader("stall-1")
	withMarker := header.Metadata(suspects, 1<<20)
	withMarker["suspectsTruncated"] = true
	exact, err := json.Marshal(withMarker)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	metadata := header.Metadata(suspects, len(exact))

	if kept, _ := metadata["suspects"].([]map[string]any); len(kept) != 1 || metadata["suspectsTruncated"] != nil {
		t.Fatalf("expected the suspect kept at exactly %d bytes, got %#v", len(exact), metadata)
	}
}
