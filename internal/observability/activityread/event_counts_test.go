package activityread

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

// countedEventType is the event type the count tests seed and count.
const countedEventType = "download.episode_downloaded"

// seedEventCounts stores the downloads of the count tests inside the hour
// before testNow, and the rows a count must leave out around them.
func seedEventCounts(t *testing.T) *Reader {
	t.Helper()
	db, reader := openTestReader(t)
	for i, metadata := range []string{
		`{"siteHost":"jkanime.org","hoster":"Mediafire"}`,
		`{"siteHost":"jkanime.org"}`,
		`{"siteHost":"jkanime.net"}`,
		`{"hoster":"Mediafire"}`,
		`{"_truncated":true,"originalBytes":5000}`,
		`not json`,
		``,
	} {
		insertEvent(t, db, event{atMS: minutesAgo(50 - i), domain: "download", level: "info", message: "downloaded",
			eventType: countedEventType, metadata: metadata})
	}
	insertEvent(t, db, event{atMS: minutesAgo(30), domain: "download", level: "info", message: "attempt",
		eventType: "download.hoster_attempt", metadata: `{"siteHost":"jkanime.org"}`})
	insertEvent(t, db, event{atMS: minutesAgo(61), domain: "download", level: "info", message: "before the range",
		eventType: countedEventType, metadata: `{"siteHost":"jkanime.org"}`})
	insertEvent(t, db, event{atMS: testNow.UnixMilli(), domain: "download", level: "info", message: "at the range end",
		eventType: countedEventType, metadata: `{"siteHost":"jkanime.org"}`})
	return reader
}

// strPtr returns a pointer to s.
func strPtr(s string) *string { return &s }

// TestCountEventsCountsOneTypeInTheRange checks the ungrouped total and the
// grouped counts: the range is half open, other event types are left out,
// and rows without the key, truncated or not JSON fall into the nil group.
func TestCountEventsCountsOneTypeInTheRange(t *testing.T) {
	reader := seedEventCounts(t)
	from, to := testNow.Add(-time.Hour), testNow
	tests := []struct {
		name    string
		groupBy string
		want    EventCounts
	}{
		{name: "ungrouped", want: EventCounts{Total: 7, Groups: []EventCount{}}},
		{name: "by site host", groupBy: "siteHost", want: EventCounts{Total: 7, Groups: []EventCount{
			{Value: nil, Count: 4}, {Value: strPtr("jkanime.org"), Count: 2}, {Value: strPtr("jkanime.net"), Count: 1},
		}}},
		{name: "by hoster", groupBy: "hoster", want: EventCounts{Total: 7, Groups: []EventCount{
			{Value: nil, Count: 5}, {Value: strPtr("Mediafire"), Count: 2},
		}}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := reader.CountEvents(context.Background(), EventCountInput{
				EventType: countedEventType, GroupBy: tc.groupBy, From: from, To: to,
			})
			if err != nil {
				t.Fatalf("CountEvents: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("counts = %s\nwant %s", describeCounts(got), describeCounts(tc.want))
			}
		})
	}
}

// TestCountEventsRejectsBadInput checks that a misshaped event type, a
// group_by that is not a plain key and an empty range fail instead of
// answering an empty count.
func TestCountEventsRejectsBadInput(t *testing.T) {
	reader := seedEventCounts(t)
	from, to := testNow.Add(-time.Hour), testNow
	for _, in := range []EventCountInput{
		{EventType: "", From: from, To: to},
		{EventType: "Download.episode_downloaded", From: from, To: to},
		{EventType: "download.episode_downloaded' OR 1=1 --", From: from, To: to},
		{EventType: countedEventType, GroupBy: "siteHost') OR 1=1 --", From: from, To: to},
		{EventType: countedEventType, GroupBy: "a.b", From: from, To: to},
		{EventType: countedEventType, GroupBy: "1host", From: from, To: to},
		{EventType: countedEventType, From: to, To: to},
	} {
		if got, err := reader.CountEvents(context.Background(), in); err == nil {
			t.Fatalf("CountEvents(%+v) = %s, want an error", in, describeCounts(got))
		}
	}
}

// describeCounts renders counts with the group values dereferenced.
func describeCounts(counts EventCounts) string {
	parts := []string{}
	for _, group := range counts.Groups {
		value := "<nil>"
		if group.Value != nil {
			value = *group.Value
		}
		parts = append(parts, fmt.Sprintf("%s=%d", value, group.Count))
	}
	return fmt.Sprintf("total %d [%s]", counts.Total, strings.Join(parts, " "))
}
