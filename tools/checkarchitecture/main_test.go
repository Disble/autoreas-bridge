package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestRun covers every owned-table boundary rule as one table over run():
// activity_log, watch_history and the two episode-duration tables each
// rejected outside their owning context and allowed inside it, a
// comment-only reference still caught by the raw substring scan, the retired
// legacy boundary, and the generated-file exemption.
func TestRun(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		path    string
		content string
		wantErr bool
	}{
		{
			name: "activity_log reference outside activity context is rejected",
			path: "internal/anime/service.go",
			content: `package anime
const query = "INSERT INTO activity_log DEFAULT VALUES"
`,
			wantErr: true,
		},
		{
			name: "activity_log reference inside activity context is allowed",
			path: "internal/activity/sqlite_store.go",
			content: `package activity
const query = "INSERT INTO activity_log DEFAULT VALUES"
`,
		},
		{
			name: "activity_log schema reference in sqlite bootstrap is allowed",
			path: "internal/sync/sqlite_bootstrap.go",
			content: `package sync
const ddl = "CREATE TABLE activity_log (id INTEGER PRIMARY KEY)"
`,
		},
		{
			// Mirrors the activity_log rule for the second owned table
			// (design.md D1).
			name: "watch_history reference outside watchhistory context is rejected",
			path: "internal/anime/service.go",
			content: `package anime
const query = "INSERT INTO watch_history DEFAULT VALUES"
`,
			wantErr: true,
		},
		{
			// The raw substring scan catches the literal even in a comment --
			// exactly why the real backfill driver
			// (internal/sync/watch_history_backfill.go) uses camelCase
			// identifiers like ensureWatchHistoryBackfill instead (Note C).
			name: "watch_history reference in a comment outside its owner is rejected",
			path: "internal/sync/watch_history_backfill.go",
			content: `package sync
// replays the audit log into watch_history
func ensureWatchHistoryBackfill() {}
`,
			wantErr: true,
		},
		{
			name: "watch_history reference inside watchhistory context is allowed",
			path: "internal/watchhistory/store_page.go",
			content: `package watchhistory
const query = "INSERT INTO watch_history DEFAULT VALUES"
`,
		},
		{
			name: "anime_episode_durations reference outside episodes context is rejected",
			path: "internal/anime/notice/today.go",
			content: `package notice
const query = "SELECT duration_ms FROM anime_episode_durations"
`,
			wantErr: true,
		},
		{
			name: "durations_pending_announce reference outside episodes context is rejected",
			path: "internal/sync/changelog_recorder.go",
			content: `package sync
const query = "DELETE FROM durations_pending_announce"
`,
			wantErr: true,
		},
		{
			name: "episode duration tables inside episodes context are allowed",
			path: "internal/anime/episodes/store.go",
			content: `package episodes
const query = "INSERT INTO anime_episode_durations DEFAULT VALUES; DELETE FROM durations_pending_announce"
`,
		},
		{
			name: "a provider adapter constructing its own http.Client is rejected",
			path: "internal/download/sites/jkanime/client.go",
			content: `package jkanime
import "net/http"
var client = &http.Client{}
`,
			wantErr: true,
		},
		{
			name: "a provider adapter test constructing an http.Client is allowed",
			path: "internal/download/sites/jkanime/client_test.go",
			content: `package jkanime
import "net/http"
var client = &http.Client{}
`,
		},
		{
			name: "a composition root bypassing the provider client with jkanime.New(nil) is rejected",
			path: "internal/desktop/app_wiring.go",
			content: `package desktop
import "autoreas-bridge/internal/download/sites/jkanime"
var adapter = jkanime.New(nil)
`,
			wantErr: true,
		},
		{
			name: "a composition root bypassing the provider client with the default searcher client is rejected",
			path: "internal/desktop/app_wiring.go",
			content: `package desktop
import "autoreas-bridge/internal/download/sites/jkanime"
var searcher = jkanime.NewSearcher(http.DefaultClient)
`,
			wantErr: true,
		},
		{
			name: "a composition root injecting the shared provider client is allowed",
			path: "internal/desktop/app_wiring.go",
			content: `package desktop
import "autoreas-bridge/internal/download/sites/jkanime"
func wire(a *App) { _ = jkanime.New(a.providerHTTPClient()) }
`,
		},
		{
			// Proves the legacy-boundary check is fully retired: no source
			// file in this package declares checkLegacyBoundary, and a file
			// that would have violated the old legacy-DTO/JSON-key/
			// animes.dat rules passes cleanly through run() (SDD-55 Slice D).
			name: "a legacy DTO reference no longer violates the retired legacy boundary",
			path: "internal/season/legacy_projection.go",
			content: `package season
import wire "autoreas-bridge/internal/anime/store"
func project(raw wire.LegacyAnimeRaw) string { return raw.SourceURL }
`,
		},
		{
			name: "a generated file is allowed",
			path: "frontend/wailsjs/go/generated.go",
			content: `// Code generated by test. DO NOT EDIT.
package generated
import "os"
func readSettings() { _, _ = os.ReadFile("settings.json") }
`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeFile(t, root, tc.path, tc.content)

			err := run(root)
			if tc.wantErr && err == nil {
				t.Fatal("expected an architecture violation")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no architecture violation, got %v", err)
			}
		})
	}
}

// TestIsWatchHistoryBoundaryFile exercises each of the four OR terms in
// isolation (each case makes exactly one term true and the other three
// false), including the tools/checkarchitecture self-exemption the checker
// needs because its own source carries the literal "watch_history" as a
// string constant (design.md D1's self-reference note).
func TestIsWatchHistoryBoundaryFile(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		path string
		want bool
	}{
		{name: "nested watchhistory path matches Contains", path: "vendor/internal/watchhistory/store.go", want: true},
		{name: "top-level watchhistory path matches HasPrefix", path: "internal/watchhistory/store.go", want: true},
		{name: "nested checkarchitecture path matches Contains", path: "vendor/tools/checkarchitecture/main.go", want: true},
		{name: "top-level checkarchitecture path matches HasPrefix", path: "tools/checkarchitecture/main.go", want: true},
		{name: "an unrelated path matches none of the terms", path: "internal/anime/service.go", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isWatchHistoryBoundaryFile(tc.path); got != tc.want {
				t.Fatalf("isWatchHistoryBoundaryFile(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}

// writeFile creates a source fixture beneath a temporary root.
func writeFile(t *testing.T, root, name, content string) {
	t.Helper()

	path := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

// TestIsEpisodesBoundaryFile exercises each of the four OR terms in
// isolation, including the tools/checkarchitecture self-exemption the checker
// needs because its own source carries both episode-duration table names.
func TestIsEpisodesBoundaryFile(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		path string
		want bool
	}{
		{name: "nested episodes path matches Contains", path: "vendor/internal/anime/episodes/store.go", want: true},
		{name: "top-level episodes path matches HasPrefix", path: "internal/anime/episodes/store.go", want: true},
		{name: "nested checkarchitecture path matches Contains", path: "vendor/tools/checkarchitecture/main.go", want: true},
		{name: "top-level checkarchitecture path matches HasPrefix", path: "tools/checkarchitecture/main.go", want: true},
		{name: "a sibling anime path matches none of the terms", path: "internal/anime/episode_service.go", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isEpisodesBoundaryFile(tc.path); got != tc.want {
				t.Fatalf("isEpisodesBoundaryFile(%q) = %v, want %v", tc.path, got, tc.want)
			}
		})
	}
}
