package activityread

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
)

// insertVersion stores one response_versions row.
func insertVersion(t *testing.T, db *sql.DB, route, hash, body string, firstMS, lastMS, count int64) {
	t.Helper()
	exec(t, db, `INSERT INTO response_versions (route_template, body_hash, body, first_seen_ms, last_seen_ms,
		seen_count) VALUES (?, ?, ?, ?, ?, ?)`, route, hash, body, firstMS, lastMS, count)
}

// TestResponseVersionsReadsOneTemplateNewestFirst checks the template filter,
// the order and every returned field.
func TestResponseVersionsReadsOneTemplateNewestFirst(t *testing.T) {
	db, reader := openTestReader(t)
	insertVersion(t, db, "/api/animes", "hash-old", `{"v":1}`, minutesAgo(300), minutesAgo(200), 7)
	insertVersion(t, db, "/api/animes", "hash-new", `{"v":2}`, minutesAgo(150), minutesAgo(5), 3)
	insertVersion(t, db, "/api/status", "hash-other", `{}`, minutesAgo(10), minutesAgo(1), 40)

	versions, err := reader.ResponseVersions(context.Background(), "/api/animes")
	if err != nil {
		t.Fatalf("ResponseVersions: %v", err)
	}
	if len(versions) != 2 {
		t.Fatalf("versions = %+v", versions)
	}
	want := ResponseVersion{BodyHash: "hash-new", Body: `{"v":2}`, FirstSeenMS: minutesAgo(150), LastSeenMS: minutesAgo(5), SeenCount: 3}
	if versions[0] != want || versions[1].BodyHash != "hash-old" || versions[1].SeenCount != 7 {
		t.Fatalf("versions = %+v", versions)
	}
}

// TestResponseVersionsEmptyAndCapped checks an unknown template, the
// required template, and the cap.
func TestResponseVersionsEmptyAndCapped(t *testing.T) {
	db, reader := openTestReader(t)
	ctx := context.Background()
	if versions, err := reader.ResponseVersions(ctx, "/api/none"); err != nil || len(versions) != 0 {
		t.Fatalf("unknown template = %+v (%v)", versions, err)
	}
	if _, err := reader.ResponseVersions(ctx, ""); err == nil {
		t.Fatal("expected an empty template to fail")
	}
	for i := range ResponseVersionLimit + 1 {
		insertVersion(t, db, "/api/animes", fmt.Sprintf("hash-%03d", i), "{}", minutesAgo(i+1), minutesAgo(i+1), 1)
	}
	versions, err := reader.ResponseVersions(ctx, "/api/animes")
	if err != nil || len(versions) != ResponseVersionLimit {
		t.Fatalf("capped = %d (%v)", len(versions), err)
	}
}
