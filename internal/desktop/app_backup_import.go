package desktop

import (
	"errors"
	"fmt"

	"autoreas-bridge/internal/backup"
	"autoreas-bridge/internal/season"
	bridgeSync "autoreas-bridge/internal/sync"
)

// errBackupImportUnavailable is returned when the bridge database has not
// finished starting up.
var errBackupImportUnavailable = errors.New("backup import unavailable: bridge database not ready")

// errConfirmWithoutMatchingPreview is returned when ConfirmBackupImport is
// called with no pending preview, or with a checksum that does not match the
// bundle a preview was produced for. A confirmation authorizes one bundle,
// not the next one.
var errConfirmWithoutMatchingPreview = errors.New("backup import: no confirmed preview matches this bundle")

// pendingBackupImport is the confirmed-preview token: an import may only be
// applied for the exact bundle a preview was produced for, identified by its
// path and the bundleChecksum reported in that preview.
type pendingBackupImport struct {
	path           string
	bundleChecksum string
}

// importGroups builds the fixed, inline import group slice -- same shape,
// order, and reasoning as ExportBackup's export slice. Adding a fourth group
// is one line here and one file in the owning package.
func (a *App) importGroups() []backup.ImportGroup {
	return []backup.ImportGroup{
		{Name: "anime_snapshots", Validate: bridgeSync.ValidateAnimeSnapshots(), Import: bridgeSync.ImportAnimeSnapshots(a.bridgeDB)},
		{Name: "seasons", Validate: season.ValidateSeasons(), Import: season.ImportSeasons(a.bridgeDB)},
		{Name: "season_animes", Validate: season.ValidateSeasonAnimes(), Import: season.ImportSeasonAnimes(a.bridgeDB)},
	}
}

// PreviewBackupImport opens a bundle chosen from the native open dialog and
// reports what importing it would do, writing nothing and creating no
// restore point. A cancelled dialog (empty path, no dialog error) returns a
// Cancelled result and reads nothing; it is not an error.
func (a *App) PreviewBackupImport() (BackupImportPreviewResult, error) {
	if a.bridgeDB == nil {
		return BackupImportPreviewResult{}, errBackupImportUnavailable
	}

	src, err := a.pickBundle(a.appContext(), "Import Backup")
	if err != nil {
		return BackupImportPreviewResult{}, fmt.Errorf("open bundle dialog: %w", err)
	}
	if src == "" {
		a.pendingBackupImport = nil
		return BackupImportPreviewResult{Cancelled: true}, nil
	}

	report, err := backup.Preview(a.appContext(), src, a.importGroups())
	if err != nil {
		a.pendingBackupImport = nil
		return BackupImportPreviewResult{}, fmt.Errorf("preview backup import: %w", err)
	}

	a.pendingBackupImport = &pendingBackupImport{path: src, bundleChecksum: report.BundleChecksum}
	return newBackupImportPreviewResult(src, report), nil
}

// ConfirmBackupImport applies the bundle previously previewed, identified by
// its bundleChecksum. The state-machine order is: match the pending preview,
// re-verify the bundle (inside backup.Apply), create the restore point, then
// apply each group. The pending preview is cleared on this call regardless
// of outcome, so a second confirmation can never replay against a database
// that has already changed underneath it.
func (a *App) ConfirmBackupImport(bundleChecksum string) (BackupImportResult, error) {
	pending := a.pendingBackupImport
	if pending == nil || pending.bundleChecksum != bundleChecksum {
		return BackupImportResult{}, errConfirmWithoutMatchingPreview
	}
	a.pendingBackupImport = nil

	if a.bridgeDB == nil {
		return BackupImportResult{}, errBackupImportUnavailable
	}

	dbPath, err := a.resolveBridgeDBPath()
	if err != nil {
		return BackupImportResult{}, fmt.Errorf("resolve bridge db path: %w", err)
	}

	// The restore point MUST be created before the first group's transaction
	// begins, and a failure here MUST abort with zero group writes -- a
	// restore point that might not exist is not a restore point.
	restorePointPath, err := bridgeSync.CreateRestorePoint(a.appContext(), a.bridgeDB, dbPath, a.currentTime())
	if err != nil {
		return BackupImportResult{}, fmt.Errorf("create restore point: %w", err)
	}

	// A group failure past this point is reported through the DTO's
	// ErrorMessage/FailedGroup fields, never as this method's Go error: Wails
	// discards the resolved value entirely when a bound method returns a
	// non-nil error, which would drop the restore point path and the
	// committed/failed/unattempted breakdown the user needs. Only a gate
	// failure before the restore point -- where there is nothing meaningful
	// to report -- surfaces as a real error above.
	report, applyErr := backup.Apply(a.appContext(), pending.path, a.importGroups())
	return newBackupImportResult(report, restorePointPath, applyErr), nil
}
