package activityread

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/observability/incident"
)

// calendar returns CalendarDays local days ending today: request totals from
// the hourly rollup (unfiltered: the rollup counts phone requests) and an
// incident flag that follows the filter. A day without any rollup row has
// HasData false, so a gap is never drawn as a quiet day.
func (r *Reader) calendar(ctx context.Context, now time.Time, s scope) ([]CalendarDay, error) {
	today := dayStart(now)
	days := make([]CalendarDay, CalendarDays)
	index := map[int64]int{}
	for i := range days {
		start := today.AddDate(0, 0, i-(CalendarDays-1)).UnixMilli()
		days[i].DayStartMS = start
		index[start] = i
	}
	dayOf := func(atMS int64) (int, bool) {
		i, ok := index[dayStart(time.UnixMilli(atMS).In(now.Location())).UnixMilli()]
		return i, ok
	}
	firstMS, nowMS := days[0].DayStartMS, now.UnixMilli()

	rows, err := r.db.QueryContext(ctx, `SELECT hour_ms, SUM(request_count) FROM request_rollup_hourly
		WHERE hour_ms >= ? AND hour_ms <= ? GROUP BY hour_ms`, firstMS, nowMS)
	if err != nil {
		return nil, fmt.Errorf("activityread: calendar totals: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var hour, count int64
		if err := rows.Scan(&hour, &count); err != nil {
			return nil, fmt.Errorf("activityread: scan calendar total: %w", err)
		}
		if i, ok := dayOf(hour); ok {
			days[i].Total += count
			days[i].HasData = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	filter, filterArgs := s.incidentFilter()
	args := append([]any{firstMS - incident.WindowBefore.Milliseconds(), firstMS, nowMS}, filterArgs...)
	incidentRows, err := r.db.QueryContext(ctx, `SELECT occurred_at_ms FROM incidents
		WHERE window_start_ms >= ? AND occurred_at_ms >= ? AND occurred_at_ms <= ? AND `+filter, args...)
	if err != nil {
		return nil, fmt.Errorf("activityread: calendar incidents: %w", err)
	}
	defer func() { _ = incidentRows.Close() }()
	for incidentRows.Next() {
		var at int64
		if err := incidentRows.Scan(&at); err != nil {
			return nil, fmt.Errorf("activityread: scan calendar incident: %w", err)
		}
		if i, ok := dayOf(at); ok {
			days[i].HasIncident = true
		}
	}
	return days, incidentRows.Err()
}
