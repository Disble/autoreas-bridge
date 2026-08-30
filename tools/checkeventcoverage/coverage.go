package main

// syntheticEntityIDs are entity identifiers that belong to demonstration or
// self-test harnesses rather than to product data. They are excluded from BOTH
// sides of the ratio: a synthetic event must not cover a write, and a synthetic
// write must not sit in the denominator waiting to be covered.
//
// This exclusion is the difference between a metric and chatter. During the
// 2026-08-29 incident the anime event domain carried 368 events, every one of
// them about `tracer-bullet-anime`, while 468 real writes committed without
// emitting anything. A count read that as health.
var syntheticEntityIDs = map[string]bool{"tracer-bullet-anime": true}

// coveringEventType is the event type that constitutes evidence a committed
// anime write was observed. An event about the right entity but a different
// subject is not evidence the write path logged anything.
const coveringEventType = "anime.write"

// WriteRecord is one committed anime write operation.
type WriteRecord struct {
	AnimeID string
}

// EventRecord is one persisted runtime event.
type EventRecord struct {
	EntityID  string
	EventType string
}

// Coverage is the real-entity event coverage measurement: how many of the
// entities that were actually written also produced a runtime event saying so.
//
// It is deliberately a ratio rather than a count. A count of anime events rose
// during the incident that destroyed data; the ratio was zero. Volume from a
// synthetic entity can inflate a count and cannot move this.
type Coverage struct {
	CommittedWrites int
	Covered         int
}

// Measurable reports whether the run observed any real committed write. A fresh
// install has nothing to cover, and reporting 0.00 there would read as a broken
// write path rather than as an empty one.
func (c Coverage) Measurable() bool {
	return c.CommittedWrites > 0
}

// Ratio is the covered proportion of committed writes, from 0 to 1. It returns
// 0 when nothing was written; callers must check Measurable first to tell that
// apart from a genuinely uncovered write path.
func (c Coverage) Ratio() float64 {
	if c.CommittedWrites == 0 {
		return 0
	}
	return float64(c.Covered) / float64(c.CommittedWrites)
}

// ComputeCoverage measures how many distinctly-written real entities emitted a
// matching runtime event.
//
// The denominator counts ENTITIES, not operations: one anime written twenty
// times is one write path to cover, and counting operations would let a chatty
// anime dominate the ratio while a silent branch elsewhere stayed invisible.
func ComputeCoverage(writes []WriteRecord, events []EventRecord) Coverage {
	// No synthetic filter on this side, deliberately. Excluding synthetic
	// entities from `written` below is sufficient: an observation is only ever
	// consulted for an entity that is already in the denominator, so a
	// synthetic event can never cover anything. A second filter here reads as
	// defence in depth but is unreachable logic — mutation testing removed it
	// and every test still passed, which is what proved it dead.
	observed := map[string]bool{}
	for _, event := range events {
		if event.EventType != coveringEventType {
			continue
		}
		observed[event.EntityID] = true
	}

	written := map[string]bool{}
	for _, write := range writes {
		if syntheticEntityIDs[write.AnimeID] {
			continue
		}
		written[write.AnimeID] = true
	}

	coverage := Coverage{CommittedWrites: len(written)}
	for animeID := range written {
		if observed[animeID] {
			coverage.Covered++
		}
	}
	return coverage
}
