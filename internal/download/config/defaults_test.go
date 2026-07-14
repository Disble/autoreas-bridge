package config

import (
	"testing"
	"time"
)

func TestDefaultHosterPrioritySeedMatchesValidatedPoCDefaults(t *testing.T) {
	t.Parallel()

	want := []HosterPrioritySeed{
		{Hoster: "Mediafire", Priority: 0},
		{Hoster: "Mega", Priority: 1},
		{Hoster: "Vidhide", Priority: 2},
		{Hoster: "Mp4upload", Priority: 3},
		{Hoster: "Mixdrop", Priority: 4},
	}
	if len(DefaultHosterPrioritySeed) != len(want) {
		t.Fatalf("expected %d default hoster seed rows, got %d (%#v)", len(want), len(DefaultHosterPrioritySeed), DefaultHosterPrioritySeed)
	}
	for i, expected := range want {
		if DefaultHosterPrioritySeed[i] != expected {
			t.Fatalf("expected seed row %d to be %#v, got %#v", i, expected, DefaultHosterPrioritySeed[i])
		}
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
