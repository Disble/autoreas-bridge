package activityread

import "testing"

func TestEventReturnsOneEventWithItsMetadata(t *testing.T) {
	db, r := openTestReader(t)
	id := insertEvent(t, db, event{atMS: minutesAgo(5), domain: "frontend", level: "error", message: "window error",
		eventType: "frontend.error", metadata: `{"route":"/#/season"}`})

	got, err := r.Event(t.Context(), id)
	if err != nil {
		t.Fatalf("event: %v", err)
	}
	if !got.Found || got.Step.ID != id || got.Step.EventType != "frontend.error" || got.Step.Level != "error" ||
		got.Step.Domain != "frontend" || got.Step.MetadataJSON != `{"route":"/#/season"}` || got.Step.AtMS != minutesAgo(5) {
		t.Fatalf("event = %+v", got)
	}
}

func TestEventReportsAMissingIDAsNotFound(t *testing.T) {
	db, r := openTestReader(t)
	id := insertEvent(t, db, event{atMS: minutesAgo(5), domain: "api", level: "info", message: "http server listening"})

	for _, missing := range []int64{0, id + 1} {
		got, err := r.Event(t.Context(), missing)
		if err != nil || got.Found {
			t.Fatalf("event %d = %+v, %v; want not found", missing, got, err)
		}
	}
}
