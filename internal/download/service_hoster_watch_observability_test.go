package download

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"autoreas-bridge/internal/download/jdownloader"
	"autoreas-bridge/internal/logger"
)

// recordedEntry is one structured log entry captured with everything a forensic assertion needs:
// the level that decides whether it is persisted at all, the event type a reader filters on, the
// message text that carries the unfilterable discriminators, and the metadata map itself.
type recordedEntry struct {
	level     string
	eventType string
	message   string
	metadata  map[string]any
}

// fieldsRecorder is a logger.Logger that retains the COMPLETE logger.Fields of every entry.
// renameEventRecorder keeps only EventType, which cannot serve assertions about Metadata or
// Level. The embedded logger.Logger supplies Debugf/Infof/Warnf/Errorf; Logf is the only method
// the download service ever calls on deps.Logger, so it is the only one that needs a body.
type fieldsRecorder struct {
	logger.Logger
	mu      sync.Mutex
	entries []recordedEntry
}

func (r *fieldsRecorder) Logf(_, level string, fields logger.Fields, format string, args ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries = append(r.entries, recordedEntry{
		level:     level,
		eventType: fields.EventType,
		message:   fmt.Sprintf(format, args...),
		metadata:  fields.Metadata,
	})
}

// byEventType returns every recorded entry carrying the given event type, in emission order.
func (r *fieldsRecorder) byEventType(eventType string) []recordedEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []recordedEntry
	for _, entry := range r.entries {
		if entry.eventType == eventType {
			out = append(out, entry)
		}
	}
	return out
}

// all returns every recorded entry, in emission order.
func (r *fieldsRecorder) all() []recordedEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]recordedEntry(nil), r.entries...)
}

// only returns the single entry carrying the given event type, failing when the count is not
// exactly one -- which is itself the "exactly one entry per attempt" assertion.
func (r *fieldsRecorder) only(t *testing.T, eventType string) recordedEntry {
	t.Helper()
	entries := r.byEventType(eventType)
	if len(entries) != 1 {
		t.Fatalf("expected exactly 1 %s entry, got %d", eventType, len(entries))
	}
	return entries[0]
}

// newProbeWatchService steers newWatchTestService -- which already advances the clock through
// PollSleep -- into running the real detect phase. It is the established post-construction
// pattern, not a second builder: building from baseDeps directly, as the pre-existing probe tests
// do, wires a FIXED clock and a no-op PollSleep, and a probe test written that way records
// identical offsets and passes without the production code measuring anything.
func newProbeWatchService(t *testing.T, jd jdownloader.JDClient, counter *svcFakeCounter, now *time.Time, hasPart func(root string) bool) (*Service, *fieldsRecorder) {
	t.Helper()
	s := newWatchTestService(t, jd, counter, now)
	s.deps.DetectStartPhaseDisabled = false
	s.deps.HasPartFiles = hasPart
	recorder := &fieldsRecorder{}
	s.deps.Logger = recorder
	return s, recorder
}

// watchAttempt runs one hoster attempt with the real detect phase and returns the captured log.
func watchAttempt(t *testing.T, jd jdownloader.JDClient, now *time.Time, hasPart func(root string) bool) *fieldsRecorder {
	t.Helper()
	folder := "folder-" + t.Name()
	counter := &svcFakeCounter{atRoot: map[string]int{folder: 4}, recursive: map[string]int{folder: 4}}
	s, recorder := newProbeWatchService(t, jd, counter, now, hasPart)
	s.awaitHosterOutcome(context.Background(), "run-1", testAnime(folder), "Mediafire", 4, 12, true)
	return recorder
}

// metadataProbes reads the serialized probe array off a recorded entry.
func metadataProbes(t *testing.T, entry recordedEntry) []map[string]any {
	t.Helper()
	raw, ok := entry.metadata["probes"]
	if !ok {
		t.Fatalf("expected %s metadata to carry a probes array, got %#v", entry.eventType, entry.metadata)
	}
	probes, ok := raw.([]map[string]any)
	if !ok {
		t.Fatalf("expected the probes array to be serializable maps, got %T", raw)
	}
	return probes
}

// probeOffset reads one probe's recorded elapsed offset.
func probeOffset(t *testing.T, probes []map[string]any, index int) int64 {
	t.Helper()
	elapsed, ok := probes[index]["elapsedMs"].(int64)
	if !ok {
		t.Fatalf("expected probe %d to carry an elapsedMs offset, got %#v", index, probes[index])
	}
	return elapsed
}

// --- probe timeline ---

func TestAwaitHosterOutcomePersistsTheProbeTimelineWhenDetectFails(t *testing.T) {
	t.Parallel()

	now := time.Now()
	jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}

	recorder := watchAttempt(t, jd, &now, func(string) bool { return false })

	entry := recorder.only(t, "download.detect_start_failed")
	if entry.level != "warn" {
		t.Fatalf("expected the failed detect phase to persist at warn level, got %q", entry.level)
	}
	probes := metadataProbes(t, entry)
	if len(probes) != 3 {
		t.Fatalf("expected the exhausted grace to persist 3 probes, got %#v", probes)
	}
	for i, p := range probes {
		if p["found"] != false {
			t.Fatalf("expected every probe of a failed detect phase to report found=false, got probe %d: %#v", i, p)
		}
	}
	// The offsets are real elapsed time, not a fixed clock: a constant clock yields spacing 0.
	// Only the SPACING is pinned; the first offset also carries whatever the attempt spent before
	// the probes ran, which is exactly the information the anchor exists to expose.
	if got := probeOffset(t, probes, 1) - probeOffset(t, probes, 0); got != 20000 {
		t.Fatalf("expected probes 1 and 2 to be 20000ms apart, got %d", got)
	}
	if got := probeOffset(t, probes, 2) - probeOffset(t, probes, 1); got != 20000 {
		t.Fatalf("expected probes 2 and 3 to be 20000ms apart, got %d", got)
	}
	if got := probeOffset(t, probes, 0); got < 20000 {
		t.Fatalf("expected the first probe to land no earlier than the 20000ms grace, got %d", got)
	}
	previous := int64(-1)
	for i := range probes {
		elapsed := probeOffset(t, probes, i)
		if elapsed <= previous {
			t.Fatalf("expected strictly increasing probe offsets, got %#v", probes)
		}
		previous = elapsed
	}
}

// slowPreCheckJDClient makes the JD pre-check cost simulated time. Without it every probe offset
// reads the same whether it is anchored at the attempt or at the detect phase, and the anchor --
// the one thing that makes the array carry information rather than three constants -- goes
// unpinned.
type slowPreCheckJDClient struct {
	*svcFakeJDClient
	advance func()
}

func (f *slowPreCheckJDClient) PackageStatusByDestination(context.Context, string, string) (jdownloader.DestinationStatus, error) {
	f.advance()
	return jdownloader.DestinationStatus{Matched: true, Links: []jdownloader.LinkSignal{{Running: true}}}, nil
}

func TestTheProbeTimelineIsAnchoredAtTheAttemptNotAtTheDetectPhase(t *testing.T) {
	t.Parallel()

	now := time.Now()
	jd := &slowPreCheckJDClient{
		svcFakeJDClient: &svcFakeJDClient{},
		advance:         func() { now = now.Add(3 * time.Second) },
	}

	recorder := watchAttempt(t, jd, &now, func(string) bool { return false })

	probes := metadataProbes(t, recorder.only(t, "download.detect_start_failed"))
	// Equality to literals is the RIGHT assertion here and the wrong one in the schedule test
	// above. There, an advancing fake produces 20000/40000/60000 under either anchor, so equality
	// proves nothing. Here the leading 23000 exists ONLY because the offsets are anchored at the
	// attempt: the pre-check spent 3s before the grace opened, and a detect-phase anchor reports
	// 20000/40000/60000 instead. This is the only test that proves the field carries the JD
	// handoff latency, which is the entire reason the anchor sits where it does.
	for i, want := range []int64{23000, 43000, 63000} {
		if got := probeOffset(t, probes, i); got != want {
			t.Fatalf("expected probe %d at %d ms including the 3000ms pre-check latency, got %d", i, want, got)
		}
	}
}

func TestDetectPhasePersistsTheProbeTimelineOnSuccess(t *testing.T) {
	t.Parallel()

	now := time.Now()
	jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}
	checks := 0

	recorder := watchAttempt(t, jd, &now, func(string) bool {
		checks++
		return checks == 2
	})

	entry := recorder.only(t, "download.detect_start_succeeded")
	if entry.level != "info" {
		t.Fatalf("expected the successful detect phase to persist at info level, got %q", entry.level)
	}
	probes := metadataProbes(t, entry)
	if len(probes) != 2 {
		t.Fatalf("expected the timeline to stop at the probe that found evidence, got %#v", probes)
	}
	if probes[0]["found"] != false {
		t.Fatalf("expected the first probe to be a recorded miss, got %#v", probes[0])
	}
	if probes[1]["found"] != true {
		t.Fatalf("expected the final probe to report the transfer evidence, got %#v", probes[1])
	}
	if got := probeOffset(t, probes, 1) - probeOffset(t, probes, 0); got != 20000 {
		t.Fatalf("expected the two probes to be 20000ms apart, got %d", got)
	}
}

func TestDetectPhasePersistsExactlyOneEntryPerAttemptOnEitherOutcome(t *testing.T) {
	t.Parallel()

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		now := time.Now()
		jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}
		checks := 0

		recorder := watchAttempt(t, jd, &now, func(string) bool {
			checks++
			return true
		})

		if checks != 1 {
			t.Fatalf("expected the detect phase to stop at the first hit, got %d probes", checks)
		}
		if got := len(recorder.byEventType("download.detect_start_succeeded")); got != 1 {
			t.Fatalf("expected exactly 1 detect_start_succeeded entry for the whole phase, got %d", got)
		}
		if got := len(recorder.byEventType("download.detect_start_failed")); got != 0 {
			t.Fatalf("expected no detect_start_failed entry on the success path, got %d", got)
		}
	})

	t.Run("failure runs three probes and still records one entry", func(t *testing.T) {
		t.Parallel()

		now := time.Now()
		jd := &downloadingJDClient{svcFakeJDClient: &svcFakeJDClient{}}
		checks := 0

		recorder := watchAttempt(t, jd, &now, func(string) bool {
			checks++
			return false
		})

		if checks != 3 {
			t.Fatalf("expected the detect phase to run 3 probes, got %d", checks)
		}
		if got := len(recorder.byEventType("download.detect_start_failed")); got != 1 {
			t.Fatalf("expected exactly 1 detect_start_failed entry for 3 probes, got %d", got)
		}
		if got := len(recorder.byEventType("download.detect_start_succeeded")); got != 0 {
			t.Fatalf("expected no detect_start_succeeded entry on the failure path, got %d", got)
		}
	})
}
