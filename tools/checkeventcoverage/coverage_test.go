package main

import "testing"

// TestSilentWritePathLowersCoverage is the measurement the incident argued for.
// 468 writes committed while the anime event domain carried nothing but a
// tracer bullet, and no count could say so. A ratio can.
func TestSilentWritePathLowersCoverage(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}, {AnimeID: "anime-2"}},
		[]EventRecord{{EntityID: "anime-1", EventType: "anime.write"}},
	)

	if coverage.CommittedWrites != 2 {
		t.Fatalf("expected 2 committed writes, got %d", coverage.CommittedWrites)
	}
	if coverage.Covered != 1 {
		t.Fatalf("expected 1 covered write, got %d", coverage.Covered)
	}
	if got := coverage.Ratio(); got != 0.5 {
		t.Fatalf("expected ratio %v, got %v", 0.5, got)
	}
}

// TestSyntheticTrafficDoesNotRaiseCoverage is the property that makes this a
// metric rather than chatter. The tracer bullet emitted 368 anime events during
// the incident; a count read that as health. Volume from a synthetic entity
// must move this number by exactly nothing.
func TestSyntheticTrafficDoesNotRaiseCoverage(t *testing.T) {
	writes := []WriteRecord{{AnimeID: "anime-1"}, {AnimeID: "anime-2"}}
	withoutNoise := ComputeCoverage(writes, []EventRecord{
		{EntityID: "anime-1", EventType: "anime.write"},
	})

	noisy := make([]EventRecord, 0, 369)
	noisy = append(noisy, EventRecord{EntityID: "anime-1", EventType: "anime.write"})
	for range 368 {
		noisy = append(noisy, EventRecord{EntityID: "tracer-bullet-anime", EventType: "tracer.step"})
	}
	withNoise := ComputeCoverage(writes, noisy)

	if withNoise.Ratio() != withoutNoise.Ratio() {
		t.Fatalf("synthetic traffic moved the ratio from %v to %v", withoutNoise.Ratio(), withNoise.Ratio())
	}
	if withNoise.Covered != 1 {
		t.Fatalf("expected synthetic events to cover nothing, got %d covered", withNoise.Covered)
	}
}

// TestSyntheticWritesAreExcludedFromTheDenominator keeps the exclusion
// symmetric. A synthetic entity that never emits a real write must not be
// counted as an uncovered one either, or the tracer bullet would drag the
// ratio down instead of up and still be measuring itself.
func TestSyntheticWritesAreExcludedFromTheDenominator(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}, {AnimeID: "tracer-bullet-anime"}},
		[]EventRecord{{EntityID: "anime-1", EventType: "anime.write"}},
	)

	if coverage.CommittedWrites != 1 {
		t.Fatalf("expected the synthetic write to leave the denominator, got %d", coverage.CommittedWrites)
	}
	if got := coverage.Ratio(); got != 1 {
		t.Fatalf("expected full coverage of the one real write, got %v", got)
	}
}

// TestUnrelatedEventTypeDoesNotCover proves an event about the right entity but
// the wrong thing is not evidence the write was logged.
func TestUnrelatedEventTypeDoesNotCover(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}},
		[]EventRecord{{EntityID: "anime-1", EventType: "websocket.broadcast"}},
	)

	if coverage.Covered != 0 {
		t.Fatalf("expected an unrelated event type to cover nothing, got %d", coverage.Covered)
	}
}

// TestNoCommittedWritesHasNoRatio pins the empty case. Zero writes is not zero
// coverage: there is nothing to be covered, and reporting 0.00 would read as a
// failing write path on a fresh install.
func TestNoCommittedWritesHasNoRatio(t *testing.T) {
	coverage := ComputeCoverage(nil, []EventRecord{{EntityID: "anime-1", EventType: "anime.write"}})

	if coverage.CommittedWrites != 0 {
		t.Fatalf("expected no committed writes, got %d", coverage.CommittedWrites)
	}
	if coverage.Measurable() {
		t.Fatal("expected an empty run to report no measurable ratio")
	}
}

// TestRepeatedWritesToOneAnimeCountOnce keeps the denominator on entities, not
// operations: one anime written twenty times is one write path to cover, and
// counting operations would let a chatty anime dominate the ratio.
func TestRepeatedWritesToOneAnimeCountOnce(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}, {AnimeID: "anime-1"}, {AnimeID: "anime-2"}},
		[]EventRecord{{EntityID: "anime-1", EventType: "anime.write"}},
	)

	if coverage.CommittedWrites != 2 {
		t.Fatalf("expected two distinct written entities, got %d", coverage.CommittedWrites)
	}
	if got := coverage.Ratio(); got != 0.5 {
		t.Fatalf("expected ratio %v, got %v", 0.5, got)
	}
}

// TestASingleWriteIsMeasurable pins Measurable at its boundary. One written
// anime is a measurable population; a guard reading `> 1` would silently
// declare the smallest real database unmeasurable and exit 0 on it.
func TestASingleWriteIsMeasurable(t *testing.T) {
	coverage := ComputeCoverage([]WriteRecord{{AnimeID: "anime-1"}}, nil)

	if !coverage.Measurable() {
		t.Fatal("expected a single committed write to be measurable")
	}
	if got := coverage.Ratio(); got != 0 {
		t.Fatalf("expected ratio %v for one uncovered write, got %v", 0.0, got)
	}
}

// TestRatioIsZeroWhenNothingWasWritten pins the division guard itself, not just
// the Measurable flag in front of it.
func TestRatioIsZeroWhenNothingWasWritten(t *testing.T) {
	if got := (Coverage{}).Ratio(); got != 0 {
		t.Fatalf("expected ratio %v with no committed writes, got %v", 0.0, got)
	}
}

// TestSyntheticWriteBetweenRealOnesDoesNotStopTheScan proves the synthetic
// filter skips one entry rather than abandoning the rest. A break here would
// silently drop every anime written after the tracer bullet.
func TestSyntheticWriteBetweenRealOnesDoesNotStopTheScan(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}, {AnimeID: "tracer-bullet-anime"}, {AnimeID: "anime-2"}},
		[]EventRecord{{EntityID: "anime-1", EventType: "anime.write"}, {EntityID: "anime-2", EventType: "anime.write"}},
	)

	if coverage.CommittedWrites != 2 {
		t.Fatalf("expected both real writes to survive the synthetic one, got %d", coverage.CommittedWrites)
	}
	if coverage.Covered != 2 {
		t.Fatalf("expected both real writes covered, got %d", coverage.Covered)
	}
}

// TestNonCoveringEventBeforeACoveringOneDoesNotStopTheScan is the same property
// on the event side: a skipped event must not end the walk, or coverage would
// depend on row order.
func TestNonCoveringEventBeforeACoveringOneDoesNotStopTheScan(t *testing.T) {
	coverage := ComputeCoverage(
		[]WriteRecord{{AnimeID: "anime-1"}},
		[]EventRecord{
			{EntityID: "tracer-bullet-anime", EventType: "tracer.step"},
			{EntityID: "anime-1", EventType: "websocket.broadcast"},
			{EntityID: "anime-1", EventType: "anime.write"},
		},
	)

	if coverage.Covered != 1 {
		t.Fatalf("expected the covering event found after two skipped ones, got %d covered", coverage.Covered)
	}
}
