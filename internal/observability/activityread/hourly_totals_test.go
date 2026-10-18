package activityread

import (
	"context"
	"reflect"
	"testing"
	"time"
)

// insertRollupRow stores one hourly rollup bucket with every key column.
func insertRollupRow(t *testing.T, reader *Reader, hourMS int64, route string, statusClass int, device string, count, maxMS int64) {
	t.Helper()
	exec(t, reader.db, `INSERT INTO request_rollup_hourly (hour_ms, route_template, status_class, device_id,
		request_count, max_duration_ms) VALUES (?, ?, ?, ?, ?, ?)`, hourMS, route, statusClass, device, count, maxMS)
}

// TestHourlyTotalsReadsOneLocalDay checks the day bounds in the given
// location, the grouping, the order and every returned field.
func TestHourlyTotalsReadsOneLocalDay(t *testing.T) {
	_, reader := openTestReader(t)
	loc := time.FixedZone("UTC-3", -3*60*60)
	midnight := time.Date(2026, 10, 16, 0, 0, 0, 0, loc).UnixMilli()
	insertRollupRow(t, reader, midnight-hourMS, "/api/status", 2, "device-1", 50, 10)
	insertRollupRow(t, reader, midnight, "/api/status", 2, "device-1", 60, 12)
	insertRollupRow(t, reader, midnight, "/api/status", 2, "", 3, 900)
	insertRollupRow(t, reader, midnight, "/api/animes", 5, "device-1", 1, 4000)
	insertRollupRow(t, reader, midnight+23*hourMS, "/api/sync/reconcile", 4, "device-2", 2, 75)
	insertRollupRow(t, reader, midnight+24*hourMS, "/api/status", 2, "device-1", 70, 11)

	totals, err := reader.HourlyTotals(context.Background(), time.Date(2026, 10, 16, 15, 30, 0, 0, loc))
	if err != nil {
		t.Fatalf("HourlyTotals: %v", err)
	}
	want := []HourlyTotal{
		{HourStartMS: midnight, RouteTemplate: "/api/animes", StatusClass: 5, DeviceID: "device-1", Count: 1, MaxDurationMS: 4000},
		{HourStartMS: midnight, RouteTemplate: "/api/status", StatusClass: 2, DeviceID: "", Count: 3, MaxDurationMS: 900},
		{HourStartMS: midnight, RouteTemplate: "/api/status", StatusClass: 2, DeviceID: "device-1", Count: 60, MaxDurationMS: 12},
		{HourStartMS: midnight + 23*hourMS, RouteTemplate: "/api/sync/reconcile", StatusClass: 4, DeviceID: "device-2", Count: 2, MaxDurationMS: 75},
	}
	if !reflect.DeepEqual(totals, want) {
		t.Fatalf("totals = %+v\nwant %+v", totals, want)
	}
}

// TestHourlyTotalsEmptyDay checks that a day without rows returns an empty,
// non-nil list.
func TestHourlyTotalsEmptyDay(t *testing.T) {
	_, reader := openTestReader(t)
	insertRollupRow(t, reader, testNow.UnixMilli()-testNow.UnixMilli()%hourMS, "/api/status", 2, "device-1", 5, 10)
	totals, err := reader.HourlyTotals(context.Background(), testNow.AddDate(0, 0, -1))
	if err != nil || totals == nil || len(totals) != 0 {
		t.Fatalf("empty day = %+v (%v)", totals, err)
	}
}
