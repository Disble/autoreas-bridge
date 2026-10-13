package main

import (
	"strings"
	"testing"
)

// TestRunEnforcesTheTransactionBaseline tables the hand-opened transaction
// rule over run(): new files are rejected, baseline files and the owner
// package are accepted, and a baseline entry that stopped opening a
// transaction is reported so the baseline only shrinks.
func TestRunEnforcesTheTransactionBaseline(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		path    string
		content string
		wantErr string
	}{
		{
			name:    "a new file calling BeginTx is rejected",
			path:    "internal/anime/episodes/store.go",
			content: "package episodes\nfunc f() { tx, _ := db.BeginTx(ctx, nil); _ = tx }\n",
			wantErr: "internal/anime/episodes/store.go opens a transaction by hand",
		},
		{
			name:    "a new file calling Begin is rejected",
			path:    "internal/anime/new_store.go",
			content: "package anime\nfunc f() { tx, _ := db.Begin(); _ = tx }\n",
			wantErr: "internal/anime/new_store.go opens a transaction by hand",
		},
		{
			name:    "a baseline file calling BeginTx is accepted",
			path:    "internal/sync/backup_import.go",
			content: "package sync\nfunc f() { tx, _ := db.BeginTx(ctx, nil); _ = tx }\n",
		},
		{
			name:    "a baseline file that no longer opens a transaction is reported",
			path:    "internal/watchhistory/store.go",
			content: "package watchhistory\nfunc f() { _ = persistence.InTx(ctx, db, fn) }\n",
			wantErr: "internal/watchhistory/store.go no longer opens a transaction by hand",
		},
		{
			name:    "the persistence package may open transactions",
			path:    "internal/persistence/tx.go",
			content: "package persistence\nfunc f() { tx, _ := db.BeginTx(ctx, nil); _ = tx }\n",
		},
		{
			name:    "a non-Go file is not scanned for transactions",
			path:    "frontend/src/db.ts",
			content: "export const tx = db.Begin();\n",
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

// TestIsTransactionOwnerFile exercises each OR term in isolation, including
// the checker's self-exemption: its source carries the call markers.
func TestIsTransactionOwnerFile(t *testing.T) {
	t.Parallel()

	cases := []struct {
		path string
		want bool
	}{
		{path: "vendor/internal/persistence/tx.go", want: true},
		{path: "internal/persistence/tx.go", want: true},
		{path: "vendor/tools/checkarchitecture/transactions.go", want: true},
		{path: "tools/checkarchitecture/transactions.go", want: true},
		{path: "internal/persistencex/tx.go", want: false},
	}
	for _, tc := range cases {
		if got := isTransactionOwnerFile(tc.path); got != tc.want {
			t.Errorf("isTransactionOwnerFile(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}
