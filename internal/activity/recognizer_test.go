package activity_test

import (
	"testing"

	"autoreas-bridge/internal/activity"
)

func TestIsEpisodeAdjustedAcceptsTheRenamedActionAndTheLegacyHistoricalValue(t *testing.T) {
	if !activity.IsEpisodeAdjusted(activity.ActionEpisodeAdjusted) {
		t.Fatalf("expected %q to be recognized as an episode adjustment", activity.ActionEpisodeAdjusted)
	}
	if !activity.IsEpisodeAdjusted("chapter_adjusted") {
		t.Fatal("expected the legacy \"chapter_adjusted\" value to still be recognized")
	}
	if activity.IsEpisodeAdjusted("something_else") {
		t.Fatal("expected an unrelated action string to be rejected")
	}
}
