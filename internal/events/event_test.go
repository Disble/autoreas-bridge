package events

import "testing"

// TestDownloadEventConstantsMatchObservabilitySpecNames asserts the download.* event name
// constants exist and match the exact strings download-observability spec "Download Events on
// the Event Bus" names (design.md §8), so the bus/subscriber side and the orchestrator agree on
// a single source of truth for these names.
func TestDownloadEventConstantsMatchObservabilitySpecNames(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"EventNameDownloadRunStarted":        EventNameDownloadRunStarted,
		"EventNameDownloadRunProgress":       EventNameDownloadRunProgress,
		"EventNameDownloadRunFinished":       EventNameDownloadRunFinished,
		"EventNameDownloadEpisodeAvailable":  EventNameDownloadEpisodeAvailable,
		"EventNameDownloadEpisodeDownloaded": EventNameDownloadEpisodeDownloaded,
		"EventNameDownloadFailed":            EventNameDownloadFailed,
		"EventNameDownloadSkipped":           EventNameDownloadSkipped,
		"EventNameDownloadJDStatus":          EventNameDownloadJDStatus,
	}

	want := map[string]string{
		"EventNameDownloadRunStarted":        "download.run_started",
		"EventNameDownloadRunProgress":       "download.run_progress",
		"EventNameDownloadRunFinished":       "download.run_finished",
		"EventNameDownloadEpisodeAvailable":  "download.episode_available",
		"EventNameDownloadEpisodeDownloaded": "download.episode_downloaded",
		"EventNameDownloadFailed":            "download.failed",
		"EventNameDownloadSkipped":           "download.skipped",
		"EventNameDownloadJDStatus":          "download.jd_status",
	}

	for name, got := range cases {
		if got != want[name] {
			t.Errorf("%s = %q, want %q", name, got, want[name])
		}
	}
}

// TestDownloadRunFinishedEventSatisfiesEventInterface asserts DownloadRunFinishedEvent.Name()
// returns the correct event name and the type satisfies the events.Event interface, mirroring
// the existing AnimeChangedEvent pattern.
func TestDownloadRunFinishedEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = DownloadRunFinishedEvent{
		RunID:         "run-1",
		Status:        "ok",
		CorrelationID: "run-1",
	}
	if e.Name() != EventNameDownloadRunFinished {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameDownloadRunFinished)
	}
}

// TestDownloadFailedEventSatisfiesEventInterface mirrors the above for the failure event, which
// carries the failure-kind classification (design §8 "captcha|hoster_down|slow_or_timeout").
func TestDownloadFailedEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = DownloadFailedEvent{
		RunID:         "run-1",
		AnimeID:       "anime-1",
		FailureKind:   "hoster_down",
		CorrelationID: "run-1",
	}
	if e.Name() != EventNameDownloadFailed {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameDownloadFailed)
	}
}

// TestDownloadSkippedEventSatisfiesEventInterface mirrors the above for the skip-accounting
// event (design §8 "Skip Accounting").
func TestDownloadSkippedEventSatisfiesEventInterface(t *testing.T) {
	t.Parallel()

	var e Event = DownloadSkippedEvent{
		RunID:         "run-1",
		AnimeID:       "anime-1",
		SkipReason:    "unsupported_tipo",
		CorrelationID: "run-1",
	}
	if e.Name() != EventNameDownloadSkipped {
		t.Errorf("Name() = %q, want %q", e.Name(), EventNameDownloadSkipped)
	}
}
