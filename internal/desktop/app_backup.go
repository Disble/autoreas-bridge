package desktop

import (
	"database/sql"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/backup"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/settings"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// bridgeVersion is stamped at build time via
// -ldflags "-X autoreas-bridge/internal/desktop.bridgeVersion=...". Release
// jobs derive that import path with `go list` rather than typing it, so
// moving this package fails the build instead of silently stamping nothing:
// Go ignores a -X whose symbol does not exist, with exit 0 and no warning
// (ADR-018).
//
// It defaults to "dev" because this repository currently carries no version
// constant anywhere -- wails.json declares none and no Go file defines one.
// If a release version constant is introduced later, this is the single
// place to wire it.
var bridgeVersion = "dev"

// ExportBackup writes a backup bundle to a user-chosen destination.
//
// The destination comes only from the native save dialog -- ExportBackup
// never accepts a caller-supplied absolute path. A cancelled dialog (empty
// path, no dialog error) returns a Cancelled result and writes nothing; it
// is not an error.
//
// Scope is enforced by exactly which groups are in this slice: only
// anime_snapshots, seasons, season_animes, watched_episodes,
// episode_durations (never its pending-announcement queue), and the
// keyboard_keymap group -- the single app_settings["keyboard.keymap"] value,
// promoted out of the machine-local exclusion below -- are exported. Every
// other table -- secrets (download_jd_config), every other app_settings key,
// and observability/bookkeeping tables (including the activity log, which
// the watched_episodes group's source_activity_id deliberately does not
// depend on resolving) -- is excluded by never appearing here, not by a flag
// or a comment.
//
// It reads the bridge database through the backup module handle: while that
// module starts the call is unavailable, after it failed a failed precondition.
func (a *App) ExportBackup() (BackupExportResult, error) {
	return a.moduleSet().backup.Use(func(services backupServices) (BackupExportResult, error) {
		return a.exportBackup(services.db)
	})
}

// exportBackup writes the bundle of db to the destination the save dialog returns.
func (a *App) exportBackup(db *sql.DB) (BackupExportResult, error) {
	dest, err := a.saveFile(a.appContext(), "Export Backup", defaultBackupFilename(a.currentTime()))
	if err != nil {
		return BackupExportResult{}, fmt.Errorf("open save dialog: %w", err)
	}
	if dest == "" {
		return BackupExportResult{Cancelled: true}, nil
	}

	groups := []backup.Group{
		{Name: "anime_snapshots", Export: bridgeSync.ExportAnimeSnapshots(db)},
		{Name: "seasons", Export: season.ExportSeasons(db)},
		{Name: "season_animes", Export: season.ExportSeasonAnimes(db)},
		{Name: "watched_episodes", Export: watchhistory.ExportWatchHistory(db)},
		{Name: "episode_durations", Export: episodes.ExportEpisodeDurations(db)},
		{Name: "keyboard_keymap", Export: settings.ExportKeymap(db)},
	}

	if err := backup.Export(a.appContext(), dest, bridgeVersion, groups); err != nil {
		return BackupExportResult{}, fmt.Errorf("export backup: %w", err)
	}

	// Verify-after-write: report exactly what landed on disk, not what Export
	// was asked to write.
	manifest, err := backup.ReadManifestFile(dest)
	if err != nil {
		return BackupExportResult{}, fmt.Errorf("read exported bundle back: %w", err)
	}

	return newExportResult(dest, manifest), nil
}

// defaultBackupFilename builds the default save-dialog filename, timestamped
// to the second so repeated exports in the same session never collide.
func defaultBackupFilename(now time.Time) string {
	return fmt.Sprintf("autoreas-backup-%s.zip", now.UTC().Format("20060102-150405"))
}
