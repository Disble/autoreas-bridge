package main

import (
	"strings"
	"testing"
)

// TestRunRequiresNameKeyOnAnimeSnapshotWriters tables the name_key writer rule
// over run(): a production statement writing snapshot_json without name_key is
// rejected in every write form, and statements that carry the key, only read,
// or live in a test, a comment or this checker are accepted.
func TestRunRequiresNameKeyOnAnimeSnapshotWriters(t *testing.T) {
	t.Parallel()

	const violation = "writes anime_snapshots.snapshot_json without name_key"
	cases := []struct {
		name    string
		path    string
		content string
		wantErr string
	}{
		{
			name:    "an insert without name_key is rejected",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `INSERT INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?)`\n",
			wantErr: "internal/sync/store.go " + violation,
		},
		{
			name:    "an update without name_key is rejected",
			path:    "internal/sync/store.go",
			content: "package sync\nfunc f() { db.Exec(\"UPDATE anime_snapshots SET snapshot_json = ? WHERE anime_id = ?\") }\n",
			wantErr: violation,
		},
		{
			name:    "an insert-or-replace across lines without name_key is rejected",
			path:    "internal/anime/store/raw.go",
			content: "package store\nconst q = `insert or replace\n\tinto anime_snapshots (anime_id, snapshot_json) values (?, ?)`\n",
			wantErr: violation,
		},
		{
			name:    "a replace into without name_key is rejected",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `REPLACE INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?)`\n",
			wantErr: violation,
		},
		{
			name:    "an unparsable production file is reported",
			path:    "internal/sync/broken.go",
			content: "package sync\nfunc {\n",
			wantErr: "internal/sync/broken.go cannot be parsed",
		},
		{
			name:    "an upsert that writes name_key is accepted",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `INSERT INTO anime_snapshots (anime_id, snapshot_json, name_key) VALUES (?, ?, ?)`\n",
		},
		{
			name:    "a write that does not touch snapshot_json is accepted",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `UPDATE anime_snapshots SET modified_at = ? WHERE anime_id = ?`\n",
		},
		{
			name:    "a read of snapshot_json is accepted",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `SELECT snapshot_json FROM anime_snapshots WHERE anime_id = ?`\n",
		},
		{
			name:    "a write to another table is accepted",
			path:    "internal/sync/store.go",
			content: "package sync\nconst q = `INSERT INTO anime_snapshots_archive (anime_id, snapshot_json) VALUES (?, ?)`\n",
		},
		{
			name:    "a comment describing a write is accepted",
			path:    "internal/sync/store.go",
			content: "package sync\n// INSERT INTO anime_snapshots (anime_id, snapshot_json) seeds a row.\nconst q = 1\n",
		},
		{
			name:    "a test seeding an old shape is accepted",
			path:    "internal/sync/store_test.go",
			content: "package sync\nconst q = `INSERT INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?)`\n",
		},
		{
			name:    "a testdata fixture is accepted",
			path:    "internal/sync/testdata/seed.go",
			content: "package seed\nconst q = `INSERT INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?)`\n",
		},
		{
			name:    "a throwaway program under a dot directory is accepted",
			path:    ".ignore/plan/plan.go",
			content: "package main\nconst q = `UPDATE anime_snapshots SET snapshot_json = ?`\n",
		},
		{
			name:    "the checker spelling the statement it rejects is accepted",
			path:    "tools/checkarchitecture/namekey.go",
			content: "package main\nconst q = `INSERT INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?)`\n",
		},
		{
			name:    "a non-Go file is not scanned",
			path:    "docs/schema.sql",
			content: "INSERT INTO anime_snapshots (anime_id, snapshot_json) VALUES (?, ?);\n",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeFile(t, root, tc.path, tc.content)

			err := run(root)
			if tc.wantErr == "" && err != nil {
				t.Fatalf("expected no architecture violation, got %v", err)
			}
			if tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
				t.Fatalf("expected a violation containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}
