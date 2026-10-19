package activityread

import (
	"context"
	"testing"
)

// TestRunsGroupsEventsByCorrelationID checks grouping, outcome and bounds.
func TestRunsGroupsEventsByCorrelationID(t *testing.T) {
	db, reader := openTestReader(t)
	insertEvent(t, db, event{atMS: minutesAgo(30), domain: "download", level: "info", message: "run started", correlationID: "run-1", eventType: "download.run_started"})
	insertEvent(t, db, event{atMS: minutesAgo(29), domain: "download", level: "warn", message: "hoster slow", correlationID: "run-1"})
	insertEvent(t, db, event{atMS: minutesAgo(28), domain: "download", level: "info", message: "run finished", correlationID: "run-1"})
	insertEvent(t, db, event{atMS: minutesAgo(10), domain: "download", level: "info", message: "run started", correlationID: "run-2"})
	insertEvent(t, db, event{atMS: minutesAgo(9), domain: "download", level: "error", message: "run failed", correlationID: "run-2"})
	insertEvent(t, db, event{atMS: minutesAgo(8), domain: "download", level: "info", message: "no run"})
	insertEvent(t, db, event{atMS: minutesAgo(8 * 24 * 60), domain: "download", level: "info", message: "old", correlationID: "run-0"})
	insertEvent(t, db, event{atMS: minutesAgo(7), domain: "anime", level: "info", message: "folder", correlationID: "anime-1"})

	runs, err := reader.Runs(context.Background(), RunsInput{Now: testNow, Where: WhereDownloads})
	if err != nil {
		t.Fatalf("Runs: %v", err)
	}
	if len(runs) != 2 {
		t.Fatalf("runs = %+v, want 2", runs)
	}
	if runs[0].CorrelationID != "run-2" || runs[0].Outcome != "error" || runs[0].Steps != 2 {
		t.Fatalf("newest run = %+v", runs[0])
	}
	first := runs[1]
	if first.Outcome != "warn" || first.FirstAtMS != minutesAgo(30) || first.LastAtMS != minutesAgo(28) ||
		first.FirstEventType != "download.run_started" || first.FirstMessage != "run started" {
		t.Fatalf("older run = %+v", first)
	}
	editor, err := reader.Runs(context.Background(), RunsInput{Now: testNow, Where: WhereEditor})
	if err != nil || len(editor) != 1 || editor[0].CorrelationID != "anime-1" {
		t.Fatalf("editor runs = %+v (%v)", editor, err)
	}
	// Recovered only: a warning was the worst step. Errors already open
	// incidents and clean runs are not problems, so both stay out, in every
	// filter including All.
	for _, where := range []Where{WhereDownloads, WhereAll} {
		recovered, err := reader.Runs(context.Background(), RunsInput{Now: testNow, Where: where, RecoveredOnly: true})
		if err != nil || len(recovered) != 1 || recovered[0].CorrelationID != "run-1" || recovered[0].Outcome != "warn" {
			t.Fatalf("recovered runs of %q = %+v (%v), want run-1 only", where, recovered, err)
		}
	}
}

// TestRunStoryOrdersStepsAndCapsThem checks order, metadata and the step cap.
func TestRunStoryOrdersStepsAndCapsThem(t *testing.T) {
	db, reader := openTestReader(t)
	insertEvent(t, db, event{atMS: minutesAgo(5), domain: "download", level: "warn", message: "probe", correlationID: "run-1",
		metadata: `{"hoster":"Mediafire","probes":[{"elapsedMs":21002,"found":false}]}`})
	insertEvent(t, db, event{atMS: minutesAgo(6), domain: "download", level: "info", message: "start", correlationID: "run-1"})
	insertEvent(t, db, event{atMS: minutesAgo(4), domain: "download", level: "info", message: "other", correlationID: "run-9"})

	story, err := reader.RunStory(context.Background(), "run-1")
	if err != nil {
		t.Fatalf("RunStory: %v", err)
	}
	if len(story.Steps) != 2 || story.Steps[0].Message != "start" || story.Steps[1].Message != "probe" || story.Truncated {
		t.Fatalf("story = %+v", story)
	}
	if story.Steps[1].MetadataJSON == "" || story.Steps[0].MetadataJSON != "" {
		t.Fatalf("metadata = %q / %q", story.Steps[0].MetadataJSON, story.Steps[1].MetadataJSON)
	}

	for i := range StoryLimit {
		insertEvent(t, db, event{atMS: minutesAgo(60) + int64(i), domain: "sync", level: "info", message: "step", correlationID: "long"})
	}
	full, err := reader.RunStory(context.Background(), "long")
	if err != nil || len(full.Steps) != StoryLimit || full.Truncated {
		t.Fatalf("a story of exactly the cap = %d steps truncated %v (%v)", len(full.Steps), full.Truncated, err)
	}
	insertEvent(t, db, event{atMS: minutesAgo(50), domain: "sync", level: "info", message: "step", correlationID: "long"})
	long, err := reader.RunStory(context.Background(), "long")
	if err != nil || len(long.Steps) != StoryLimit || !long.Truncated {
		t.Fatalf("long story = %d steps truncated %v (%v)", len(long.Steps), long.Truncated, err)
	}
	if empty, err := reader.RunStory(context.Background(), ""); err != nil || len(empty.Steps) != 0 {
		t.Fatalf("an empty correlation id has no story: %+v (%v)", empty, err)
	}
}
