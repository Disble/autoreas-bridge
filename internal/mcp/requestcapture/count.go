package requestcapture

import (
	"context"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/observability/activityread"
)

// countEvents answers count_events over whole local days: from_day to
// to_day inclusive, by default every one of the calendar's days. The
// read model validates the event type and the group_by key.
func (t tools) countEvents(ctx context.Context, in CountEventsInput) (CountEventsResult, error) {
	now := t.now()
	from, to, err := countedDays(in, now)
	if err != nil {
		return CountEventsResult{}, err
	}
	eventType, groupBy := strings.TrimSpace(in.EventType), strings.TrimSpace(in.GroupBy)
	end := to.AddDate(0, 0, 1)
	counts, err := t.reader.activity.CountEvents(ctx, activityread.EventCountInput{
		EventType: eventType, GroupBy: groupBy, From: from, To: end,
	})
	if err != nil {
		return CountEventsResult{}, err
	}
	groups := make([]EventGroup, len(counts.Groups))
	for i, group := range counts.Groups {
		groups[i] = EventGroup{Value: group.Value, Count: group.Count}
	}
	coverage, err := t.coverage(ctx, newTimeRange(from.UnixMilli(), end.UnixMilli()-1), sourceEvents)
	return CountEventsResult{EventType: eventType, GroupBy: groupBy, Total: counts.Total, Groups: groups, Coverage: coverage}, err
}

// countedDays returns local midnight of the first and the last day counted.
// An absent from_day is the calendar's oldest day, an absent to_day today.
func countedDays(in CountEventsInput, now time.Time) (from, to time.Time, err error) {
	to = localMidnight(now, now.Location())
	from = to.AddDate(0, 0, 1-activityread.CalendarDays)
	if date := strings.TrimSpace(in.FromDay); date != "" {
		if from, err = calendarDate("from_day", date, now); err != nil {
			return time.Time{}, time.Time{}, err
		}
	}
	if date := strings.TrimSpace(in.ToDay); date != "" {
		if to, err = calendarDate("to_day", date, now); err != nil {
			return time.Time{}, time.Time{}, err
		}
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("to_day %s is before from_day %s", to.Format(time.DateOnly), from.Format(time.DateOnly))
	}
	return from, to, nil
}
