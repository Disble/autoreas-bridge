package config

import (
	"testing"
	"time"
)

func TestDefaultHosterPrioritySeedMatchesValidatedPoCDefaults(t *testing.T) {
	t.Parallel()

	if DefaultHosterPrioritySeed[0].Hoster != "Mediafire" || DefaultHosterPrioritySeed[0].Priority != 0 {
		t.Fatalf("expected Mediafire at priority 0, got %#v", DefaultHosterPrioritySeed[0])
	}
	if DefaultHosterPrioritySeed[1].Hoster != "Mega" || DefaultHosterPrioritySeed[1].Priority != 1 {
		t.Fatalf("expected Mega at priority 1, got %#v", DefaultHosterPrioritySeed[1])
	}
}

func TestRunRetentionLimitIs200(t *testing.T) {
	t.Parallel()

	if RunRetentionLimit != 200 {
		t.Fatalf("expected RunRetentionLimit 200 (design ADR-RETENTION), got %d", RunRetentionLimit)
	}
}

func TestJDAutoLaunchPollTimeoutIs90Seconds(t *testing.T) {
	t.Parallel()

	if JDAutoLaunchPollTimeout != 90*time.Second {
		t.Fatalf("expected JDAutoLaunchPollTimeout 90s (PoC #12), got %v", JDAutoLaunchPollTimeout)
	}
}

func TestFilesystemCompletionPollIntervalIs5Seconds(t *testing.T) {
	t.Parallel()

	if FilesystemCompletionPollInterval != 5*time.Second {
		t.Fatalf("expected FilesystemCompletionPollInterval 5s (PoC orchestrator), got %v", FilesystemCompletionPollInterval)
	}
}

func TestFilesystemCompletionPollTimeoutIs30Minutes(t *testing.T) {
	t.Parallel()

	if FilesystemCompletionPollTimeout != 30*time.Minute {
		t.Fatalf("expected FilesystemCompletionPollTimeout 30m (PoC orchestrator), got %v", FilesystemCompletionPollTimeout)
	}
}

func TestVideoFileExtensionsMatchesPoCSet(t *testing.T) {
	t.Parallel()

	want := []string{".mp4", ".mkv", ".avi", ".webm", ".m4v", ".flv", ".mov", ".wmv", ".ts"}
	if len(VideoFileExtensions) != len(want) {
		t.Fatalf("expected %d video extensions, got %d (%#v)", len(want), len(VideoFileExtensions), VideoFileExtensions)
	}
	for _, ext := range want {
		if !VideoFileExtensions[ext] {
			t.Fatalf("expected video extension %q to be present in VideoFileExtensions, got %#v", ext, VideoFileExtensions)
		}
	}
}

func TestSpanishWeekdayHelperReturnsAccentedNamesForFixedTime(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		date time.Time
		want string
	}{
		{name: "monday", date: time.Date(2026, time.June, 22, 12, 0, 0, 0, time.UTC), want: "Lunes"},
		{name: "wednesday", date: time.Date(2026, time.June, 24, 12, 0, 0, 0, time.UTC), want: "Miércoles"},
		{name: "saturday", date: time.Date(2026, time.June, 27, 12, 0, 0, 0, time.UTC), want: "Sábado"},
		{name: "sunday", date: time.Date(2026, time.June, 28, 12, 0, 0, 0, time.UTC), want: "Domingo"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := SpanishWeekdayName(tc.date)
			if got != tc.want {
				t.Fatalf("expected %q for %v, got %q", tc.want, tc.date, got)
			}
		})
	}
}
