package activityread

import (
	"context"
	"database/sql"
	"reflect"
	"strconv"
	"testing"

	"autoreas-bridge/internal/observability/syncreading"
)

// insertStart stores one api.listening row, minutes ago, with its metadata.
func insertStart(t *testing.T, db *sql.DB, minutes int, metadata string) int64 {
	t.Helper()
	atMS := minutesAgo(minutes)
	insertEvent(t, db, event{atMS: atMS, domain: "api", level: "info", message: "http server listening", eventType: "api.listening", metadata: metadata})
	return atMS
}

// contactRecord is the metadata of a start that holds device-1's last contact.
func contactRecord(minutes int) string {
	return `{"addr":"[::]:9876","lastContacts":{"device-1":` + strconv.FormatInt(minutesAgo(minutes), 10) + `}}`
}

func TestSyncStartsReadOldestFirstWithTheirRecordsOnly(t *testing.T) {
	db, r := openTestReader(t)
	insertStart(t, db, 100, contactRecord(150))
	insertStart(t, db, 300, "")
	insertEvent(t, db, event{atMS: minutesAgo(200), domain: "api", level: "warn", message: "capture swept", eventType: "api.capture_swept"})
	insertEvent(t, db, event{atMS: minutesAgo(250), domain: "api", level: "info", message: "request accepted"})
	insertEvent(t, db, event{atMS: minutesAgo(240), domain: "api", level: "info", message: "http server listening on [::]:9876", eventType: "api.other"})
	insertEvent(t, db, event{atMS: minutesAgo(400), domain: "api", level: "info", message: "http server listening on [::]:9876"})

	starts, err := r.SyncStarts(context.Background())
	if err != nil {
		t.Fatalf("sync starts: %v", err)
	}
	want := []syncreading.Start{{AtMS: minutesAgo(400)}, {AtMS: minutesAgo(300)},
		{AtMS: minutesAgo(100), LastContacts: map[string]int64{"device-1": minutesAgo(150)}}}
	if !reflect.DeepEqual(starts, want) {
		t.Fatalf("starts = %+v, want %+v", starts, want)
	}
}
