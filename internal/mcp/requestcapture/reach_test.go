package requestcapture

import (
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"autoreas-bridge/internal/observability/activityread"
)

// TestSearchHistoryListsBroadcasts checks that search_history lists the
// bridge's pushes beside connects, as connection lines.
func TestSearchHistoryListsBroadcasts(t *testing.T) {
	h := newHarness(t)
	h.exec(t, `INSERT INTO request_captures (request_id, captured_at_ms, kind, route, transport, device_id,
		device_name, outcome, payload_json, correlation_json) VALUES
		('push-1', ?, 'ws_broadcast', '/ws', 'websocket', 'device-1', 'SM-X800', 'completed', '{}', '{}'),
		('conn-1', ?, 'ws_connect', '/ws', 'websocket', 'device-1', 'SM-X800', 'completed', '{}', '{}')`,
		minutesAgo(3*24*60), minutesAgo(3*24*60+5))

	var got HistoryResult
	h.call(t, "search_history", map[string]any{"where": "phone"}, &got)
	var titles []string
	for _, day := range got.History.Days {
		for _, line := range day.Lines {
			if line.Kind == activityread.LineConnection {
				titles = append(titles, line.ID+":"+line.Title)
			}
		}
	}
	if want := []string{"push-1:ws_broadcast", "conn-1:ws_connect"}; !slices.Equal(titles, want) {
		t.Fatalf("connection lines = %v, want %v", titles, want)
	}
}

// TestGetHourlyTotals checks one local day's buckets, by date and by
// milliseconds, the coverage, an empty day and days outside the 90 days.
func TestGetHourlyTotals(t *testing.T) {
	h := newHarness(t)
	midnight := time.Date(2026, 9, 17, 0, 0, 0, 0, time.UTC).UnixMilli()
	insert := `INSERT INTO request_rollup_hourly (hour_ms, route_template, status_class, device_id, request_count,
		max_duration_ms) VALUES (?, ?, ?, ?, ?, ?)`
	h.exec(t, insert, midnight+3*3600000, "/api/sync/reconcile", 5, "device-1", 2, 8000)
	h.exec(t, insert, midnight+3*3600000, "/api/status", 2, "device-1", 120, 30)
	h.exec(t, insert, midnight-3600000, "/api/status", 2, "device-1", 99, 31)

	var byDate HourlyTotalsResult
	h.call(t, "get_hourly_totals", map[string]any{"day": "2026-09-17"}, &byDate)
	want := []activityread.HourlyTotal{
		{HourStartMS: midnight + 3*3600000, RouteTemplate: "/api/status", StatusClass: 2, DeviceID: "device-1", Count: 120, MaxDurationMS: 30},
		{HourStartMS: midnight + 3*3600000, RouteTemplate: "/api/sync/reconcile", StatusClass: 5, DeviceID: "device-1", Count: 2, MaxDurationMS: 8000},
	}
	if byDate.DayStartMS != midnight || !slices.Equal(byDate.Totals, want) {
		t.Fatalf("by date = %+v", byDate)
	}
	if names := sourceNames(byDate.Coverage); !slices.Equal(names, []string{"request_rollup_hourly"}) {
		t.Fatalf("sources = %v", names)
	}
	window := byDate.Coverage.Window
	if window == nil || window.FromMS != midnight || window.ToMS != midnight+24*3600000-1 {
		t.Fatalf("window = %+v", window)
	}
	if covered := byDate.Coverage.Covered; covered == nil || covered.FromMS != midnight || covered.ToMS != midnight+3*3600000 {
		t.Fatalf("covered = %+v", covered)
	}
	var byMS HourlyTotalsResult
	h.call(t, "get_hourly_totals", map[string]any{"day_ms": midnight + 15*3600000}, &byMS)
	if byMS.DayStartMS != midnight || !slices.Equal(byMS.Totals, want) {
		t.Fatalf("by ms = %+v", byMS)
	}
	var empty HourlyTotalsResult
	h.call(t, "get_hourly_totals", map[string]any{"day": "2026-10-01"}, &empty)
	if empty.Totals == nil || len(empty.Totals) != 0 || empty.Coverage.Window == nil || len(empty.Coverage.Sources) != 1 {
		t.Fatalf("empty day = %+v", empty)
	}
	for _, args := range []map[string]any{
		{"day": "2026-07-19"}, {"day": "2026-10-18"}, {"day": "17/10/2026"}, {}, {"day": "2026-10-17", "day_ms": midnight},
	} {
		if text := h.callError(t, "get_hourly_totals", args); !strings.Contains(text, "day") {
			t.Fatalf("get_hourly_totals(%v) error = %q", args, text)
		}
	}
	var oldest HourlyTotalsResult
	h.call(t, "get_hourly_totals", map[string]any{"day": "2026-07-20"}, &oldest)
	var today HourlyTotalsResult
	h.call(t, "get_hourly_totals", map[string]any{"day": "2026-10-17"}, &today)
	if want := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC).UnixMilli(); today.DayStartMS != want {
		t.Fatalf("today starts at %d, want %d", today.DayStartMS, want)
	}
}

// TestListResponseVersionsAt checks that at_ms keeps only the versions
// whose seen interval holds it.
func TestListResponseVersionsAt(t *testing.T) {
	h := newHarness(t)
	insert := `INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms, seen_count)
		VALUES ('/api/sync/reconcile', ?, '{}', ?, ?, 1)`
	h.exec(t, insert, "old", minutesAgo(50*24*60), minutesAgo(40*24*60))
	h.exec(t, insert, "new", minutesAgo(10), minutesAgo(1))

	var got ResponseVersionsResult
	h.call(t, "list_response_versions", map[string]any{"route_template": "/api/sync/reconcile", "at_ms": minutesAgo(45 * 24 * 60)}, &got)
	if len(got.Versions) != 1 || got.Versions[0].BodyHash != "old" {
		t.Fatalf("versions at 45 d = %+v", got.Versions)
	}
	var none ResponseVersionsResult
	h.call(t, "list_response_versions", map[string]any{"route_template": "/api/sync/reconcile", "at_ms": minutesAgo(60 * 24 * 60)}, &none)
	if none.Versions == nil || len(none.Versions) != 0 {
		t.Fatalf("versions before every version = %+v", none.Versions)
	}
	var latest ResponseVersionsResult
	h.call(t, "list_response_versions", map[string]any{"route_template": "/api/sync/reconcile"}, &latest)
	if len(latest.Versions) != 2 || latest.Versions[0].BodyHash != "new" {
		t.Fatalf("latest versions = %+v", latest.Versions)
	}
}

// TestCountEvents checks count_events over the protocol: the default 90
// days, the grouped and ungrouped answers, a day range, its coverage window,
// and the inputs it refuses instead of answering an empty count.
func TestCountEvents(t *testing.T) {
	h := newHarness(t)
	insert := `INSERT INTO runtime_events (occurred_at_ms, domain, level, message, event_type, metadata_json)
		VALUES (?, 'download', 'info', 'downloaded', ?, NULLIF(?, ''))`
	at := func(date string, hour int) int64 {
		day, _ := time.ParseInLocation(time.DateOnly, date, time.UTC)
		return day.Add(time.Duration(hour) * time.Hour).UnixMilli()
	}
	h.exec(t, insert, at("2026-10-17", 10), "download.episode_downloaded", `{"siteHost":"jkanime.org"}`)
	h.exec(t, insert, at("2026-10-16", 10), "download.episode_downloaded", `{"siteHost":"jkanime.org"}`)
	h.exec(t, insert, at("2026-10-16", 11), "download.episode_downloaded", `{"siteHost":"jkanime.net"}`)
	h.exec(t, insert, at("2026-10-16", 12), "download.hoster_attempt", `{"siteHost":"jkanime.org"}`)
	h.exec(t, insert, at("2026-10-15", 10), "download.episode_downloaded", `{"hoster":"Mediafire"}`)
	h.exec(t, insert, at("2026-07-20", 0), "download.episode_downloaded", `{"siteHost":"jkanime.org"}`)
	h.exec(t, insert, at("2026-07-19", 23), "download.episode_downloaded", `{"siteHost":"jkanime.org"}`)
	org, net := "jkanime.org", "jkanime.net"

	var grouped CountEventsResult
	h.call(t, "count_events", map[string]any{"event_type": "download.episode_downloaded", "group_by": "siteHost"}, &grouped)
	want := []EventGroup{{Value: &org, Count: 3}, {Value: &net, Count: 1}, {Value: nil, Count: 1}}
	if grouped.Total != 5 || grouped.GroupBy != "siteHost" || !reflect.DeepEqual(grouped.Groups, want) {
		t.Fatalf("grouped = %+v", grouped)
	}
	if window := grouped.Coverage.Window; window == nil || window.FromMS != at("2026-07-20", 0) || window.ToMS != at("2026-10-18", 0)-1 {
		t.Fatalf("default window = %+v", window)
	}
	if names := sourceNames(grouped.Coverage); !slices.Equal(names, []string{"runtime_events"}) {
		t.Fatalf("sources = %v", names)
	}
	var total CountEventsResult
	h.call(t, "count_events", map[string]any{"event_type": "download.episode_downloaded"}, &total)
	if total.Total != 5 || total.Groups == nil || len(total.Groups) != 0 {
		t.Fatalf("ungrouped = %+v", total)
	}
	var oneDay CountEventsResult
	h.call(t, "count_events", map[string]any{"event_type": "download.episode_downloaded", "group_by": "siteHost",
		"from_day": "2026-10-16", "to_day": "2026-10-16"}, &oneDay)
	if want := []EventGroup{{Value: &net, Count: 1}, {Value: &org, Count: 1}}; oneDay.Total != 2 || !reflect.DeepEqual(oneDay.Groups, want) {
		t.Fatalf("one day = %+v", oneDay)
	}
	if window := oneDay.Coverage.Window; window == nil || window.FromMS != at("2026-10-16", 0) || window.ToMS != at("2026-10-17", 0)-1 {
		t.Fatalf("one-day window = %+v", window)
	}
	for _, tc := range []struct {
		args map[string]any
		want string
	}{
		{map[string]any{"event_type": " "}, "event type"},
		{map[string]any{"event_type": "download"}, "event type"},
		{map[string]any{"event_type": "download.episode_downloaded", "group_by": "$.siteHost"}, "group_by"},
		{map[string]any{"event_type": "download.episode_downloaded", "group_by": "site host"}, "group_by"},
		{map[string]any{"event_type": "download.episode_downloaded", "from_day": "2026-07-19"}, "outside"},
		{map[string]any{"event_type": "download.episode_downloaded", "to_day": "2026-10-18"}, "outside"},
		{map[string]any{"event_type": "download.episode_downloaded", "from_day": "16/10/2026"}, "from_day"},
		{map[string]any{"event_type": "download.episode_downloaded", "from_day": "2026-10-17", "to_day": "2026-10-16"}, "before"},
	} {
		if text := h.callError(t, "count_events", tc.args); !strings.Contains(text, tc.want) {
			t.Fatalf("count_events(%v) error = %q, want %q", tc.args, text, tc.want)
		}
	}
}
