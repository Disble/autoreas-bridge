package events

import "testing"

// TestSeasonEventConstantsMatchContractNames asserts the season.* event name
// constants exist and match the exact strings the season-matching-resilience
// T3 contract names (mirroring the download.* constants test above), so the
// bus/subscriber side and the season service agree on a single source of
// truth for these names.
func TestSeasonEventConstantsMatchContractNames(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"EventNameSeasonMatchingStarted":  EventNameSeasonMatchingStarted,
		"EventNameSeasonMatchingProgress": EventNameSeasonMatchingProgress,
		"EventNameSeasonMatchingFinished": EventNameSeasonMatchingFinished,
	}

	want := map[string]string{
		"EventNameSeasonMatchingStarted":  "season.matching_started",
		"EventNameSeasonMatchingProgress": "season.matching_progress",
		"EventNameSeasonMatchingFinished": "season.matching_finished",
	}

	for name, got := range cases {
		if got != want[name] {
			t.Errorf("%s = %q, want %q", name, got, want[name])
		}
	}
}

// TestSeasonMatchingPhaseConstants pins the two phase values a progress event
// carries (docs/ubiquitous-language.md: "name matching" and the "availability
// check"), so the panel never claims to be matching while it is really
// checking episodes.
func TestSeasonMatchingPhaseConstants(t *testing.T) {
	t.Parallel()

	if SeasonMatchingPhaseMatching != "name_matching" {
		t.Errorf("SeasonMatchingPhaseMatching = %q, want %q", SeasonMatchingPhaseMatching, "name_matching")
	}
	if SeasonMatchingPhaseAvailabilityCheck != "availability_check" {
		t.Errorf("SeasonMatchingPhaseAvailabilityCheck = %q, want %q", SeasonMatchingPhaseAvailabilityCheck, "availability_check")
	}
}

// TestSeasonMatchingStartedEventSatisfiesEventInterface mirrors the download
// run-started pattern: the started event carries the RUN TOTAL (how many rows
// this run will attempt), never per-state counters.
func TestSeasonMatchingStartedEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = SeasonMatchingStartedEvent{
		SeasonID: "season-1",
		Total:    12,
	}
	if e.Name() != EventNameSeasonMatchingStarted {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameSeasonMatchingStarted)
	}
}

// TestSeasonMatchingProgressEventSatisfiesEventInterface mirrors the above for
// the per-row event: it carries THE ROW that just resolved, plus the phase it
// resolved in.
func TestSeasonMatchingProgressEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = SeasonMatchingProgressEvent{
		SeasonID:     "season-1",
		Phase:        SeasonMatchingPhaseMatching,
		RowID:        "row-1",
		RawName:      "Good Anime",
		MatchStatus:  "matched",
		MatchedSlug:  "https://jkanime.net/good-anime/",
		Candidates:   nil,
		Availability: "waiting",
	}
	if e.Name() != EventNameSeasonMatchingProgress {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameSeasonMatchingProgress)
	}
}

// TestSeasonMatchingFinishedEventSatisfiesEventInterface mirrors the above for
// the terminal signal: one event, no counters, no run history.
func TestSeasonMatchingFinishedEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = SeasonMatchingFinishedEvent{SeasonID: "season-1"}
	if e.Name() != EventNameSeasonMatchingFinished {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameSeasonMatchingFinished)
	}
}
