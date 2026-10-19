package activityread

import (
	"context"
	"fmt"
	"testing"
)

// TestRecorderMergesNewestFirstWithinTwoHours checks the merge and the time bound.
func TestRecorderMergesNewestFirstWithinTwoHours(t *testing.T) {
	db, reader := openTestReader(t)
	insertCapture(t, db, capture{id: "req-new", kind: "get", route: "/api/status", atMS: minutesAgo(1), status: 200, durationMS: 4})
	insertEvent(t, db, event{atMS: minutesAgo(2), domain: "sync", level: "info", message: "changelog"})
	insertCapture(t, db, capture{id: "req-old", kind: "reconcile", route: "/api/sync/reconcile", atMS: minutesAgo(3), status: 500, errorCode: "boom"})
	insertCapture(t, db, capture{id: "req-edge", kind: "get", route: "/api/status", atMS: minutesAgo(119), status: 200})
	insertCapture(t, db, capture{id: "req-gone", kind: "get", route: "/api/status", atMS: minutesAgo(121), status: 200})
	insertEvent(t, db, event{atMS: minutesAgo(121), domain: "sync", level: "info", message: "gone"})

	page, err := reader.Recorder(context.Background(), RecorderInput{Now: testNow})
	if err != nil {
		t.Fatalf("Recorder: %v", err)
	}
	if len(page.Entries) != 4 || page.NextCursor != "" {
		t.Fatalf("entries = %+v", page.Entries)
	}
	if page.Entries[0].ID != "req-new" || page.Entries[1].Source != SourceEvent || page.Entries[2].ErrorCode != "boom" {
		t.Fatalf("order = %+v", page.Entries)
	}
	if page.Entries[0].Source != SourceRequest || *page.Entries[0].HTTPStatus != 200 || *page.Entries[0].DurationMS != 4 {
		t.Fatalf("request summary = %+v", page.Entries[0])
	}
}

// TestRecorderCursorAndLimit pages through ties without gaps or duplicates
// and caps the page size.
func TestRecorderCursorAndLimit(t *testing.T) {
	db, reader := openTestReader(t)
	for i := range 75 {
		at := minutesAgo(1 + i%5) // many rows share a millisecond
		insertCapture(t, db, capture{id: fmt.Sprintf("req-%02d", i), kind: "get", route: "/api/status", atMS: at, status: 200})
		insertEvent(t, db, event{atMS: at, domain: "sync", level: "info", message: "e"})
	}
	ctx := context.Background()
	capped, err := reader.Recorder(ctx, RecorderInput{Now: testNow, Limit: 1000})
	if err != nil || len(capped.Entries) != MaxPageLimit || capped.NextCursor == "" {
		t.Fatalf("capped page = %d entries (%v)", len(capped.Entries), err)
	}
	defaulted, err := reader.Recorder(ctx, RecorderInput{Now: testNow})
	if err != nil || len(defaulted.Entries) != DefaultPageLimit {
		t.Fatalf("default page = %d entries (%v)", len(defaulted.Entries), err)
	}
	entries := pageRecorder(t, reader, 7)
	seen := map[string]bool{}
	previous := int64(1 << 62)
	for _, entry := range entries {
		key := entry.Source + "/" + entry.ID
		if seen[key] {
			t.Fatalf("duplicate %s", key)
		}
		if entry.AtMS > previous {
			t.Fatalf("%s is newer than the entry before it", key)
		}
		seen[key], previous = true, entry.AtMS
	}
	if len(seen) != 150 {
		t.Fatalf("paged %d entries, want 150", len(seen))
	}
}

// pageRecorder follows the recorder cursor with limit until it ends and
// returns every entry in order.
func pageRecorder(t *testing.T, reader *Reader, limit int) []RecorderEntry {
	t.Helper()
	var entries []RecorderEntry
	cursor := ""
	for pages := 0; pages <= 40; pages++ {
		page, err := reader.Recorder(context.Background(), RecorderInput{Now: testNow, Cursor: cursor, Limit: limit})
		if err != nil {
			t.Fatalf("page %d: %v", pages, err)
		}
		entries = append(entries, page.Entries...)
		if page.NextCursor == "" {
			return entries
		}
		cursor = page.NextCursor
	}
	t.Fatal("the cursor never ended")
	return nil
}
