package desktop

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/backup"
	"autoreas-bridge/internal/lifecycle"
	bridgeSync "autoreas-bridge/internal/sync"
)

// inBackupState binds app's bridge database to the backup handle through the production bind
// step and moves the backup module to state: ready through its wiring check, failed with
// moduleFailureReason, or starting.
func inBackupState(app *App, state lifecycle.State) *App {
	app.bindBackupModule()
	return inModuleState(app, moduleBackup, state)
}

// backupApp returns an App over a fresh bridge database whose dialogs and database path point
// at temporary locations, with its backup module in state.
func backupApp(t *testing.T, state lifecycle.State) *App {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	db, err := bridgeSync.OpenBridgeDB(dbPath)
	if err != nil {
		t.Fatalf("open bridge db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	app := newAppTestApp(t)
	app.bridgeDB = db
	app.resolveBridgeDBPath = func() (string, error) { return dbPath, nil }
	app.saveFile = func(context.Context, string, string) (string, error) {
		return filepath.Join(t.TempDir(), "backup.zip"), nil
	}
	app.pickBundle = func(context.Context, string) (string, error) { return "", nil }
	return inBackupState(app, state)
}

// previewedBundle builds a real bundle and records it as app's pending preview, so a confirmation
// for its checksum reaches the restore point and the group writes.
func previewedBundle(t *testing.T, app *App) string {
	t.Helper()
	path := buildTestBundle(t)
	manifest, err := backup.ReadManifestFile(path)
	if err != nil {
		t.Fatalf("read test bundle: %v", err)
	}
	app.pendingBackupImport = &pendingBackupImport{path: path, bundleChecksum: manifest.BundleChecksum}
	return manifest.BundleChecksum
}

// backupBindings are the bindings that read the bridge database through the backup handle: the
// call reports whether the answer is the one a ready module serves.
var backupBindings = []struct {
	name string
	call func(*testing.T, *App) (bool, error)
}{
	{"GetSQLiteStatus", func(_ *testing.T, a *App) (bool, error) {
		got, err := a.GetSQLiteStatus()
		return got == "ok", err
	}},
	{"ExportBackup", func(_ *testing.T, a *App) (bool, error) {
		got, err := a.ExportBackup()
		return !got.Cancelled && got.DestinationPath != "" && len(got.Groups) == 6, err
	}},
	{"PreviewBackupImport", func(_ *testing.T, a *App) (bool, error) {
		got, err := a.PreviewBackupImport()
		return got.Cancelled, err
	}},
	{"ConfirmBackupImport", func(t *testing.T, a *App) (bool, error) {
		got, err := a.ConfirmBackupImport(previewedBundle(t, a))
		return got.RestorePointPath != "" && got.FailedGroup == "" && len(got.ImportedGroups) == 6, err
	}},
}

// TestBackupBindingsFollowTheBackupModule pins S1 for the SQLite status and the backup bindings:
// none answers a status string, a database error or a result while the backup module starts or
// after it failed.
func TestBackupBindingsFollowTheBackupModule(t *testing.T) {
	t.Parallel()
	for _, binding := range backupBindings {
		t.Run(binding.name+"/starting then failed", func(t *testing.T) {
			t.Parallel()
			call := func(a *App) (bool, error) { return binding.call(t, a) }
			assertStartingThenFailed(t, backupApp(t, lifecycle.StateStarting), moduleBackup, "backup is starting", call)
		})
		t.Run(binding.name+"/ready answers the value", func(t *testing.T) {
			t.Parallel()
			served, err := binding.call(t, backupApp(t, lifecycle.StateReady))
			assertModuleAnswer(t, served, err, "", "")
		})
	}
}

// TestConfirmBackupImportNotReadyKeepsThePendingPreview pins that a refused confirmation writes
// nothing: no restore point, and the pending preview it never read stays as it was.
func TestConfirmBackupImportNotReadyKeepsThePendingPreview(t *testing.T) {
	t.Parallel()
	app := backupApp(t, lifecycle.StateStarting)
	dbPath, _ := app.resolveBridgeDBPath()
	checksum := previewedBundle(t, app)
	pending := app.pendingBackupImport
	for _, state := range []lifecycle.State{lifecycle.StateStarting, lifecycle.StateFailed} {
		inModuleState(app, moduleBackup, state)

		if _, err := app.ConfirmBackupImport(checksum); err == nil {
			t.Fatalf("%s: a module that is not ready confirmed an import", state)
		}

		if app.pendingBackupImport != pending {
			t.Fatalf("%s: pending preview = %+v, want it untouched", state, app.pendingBackupImport)
		}
		assertNoRestorePoint(t, dbPath)
	}
}

// TestBackupServiceFailuresAreInternal pins that a failing database, dialog or path step
// reaches the frontend as an internal failure carrying its cause, never as a status string.
func TestBackupServiceFailuresAreInternal(t *testing.T) {
	t.Parallel()
	dialogFailure := errors.New("dialog crashed")
	pathFailure := errors.New("bridge.db path unknown")
	cases := []struct {
		name    string
		breakIt func(*App)
		call    func(*testing.T, *App) error
		cause   error
	}{
		{"GetSQLiteStatus over a closed database", func(a *App) { _ = a.bridgeDB.Close() }, func(_ *testing.T, a *App) error {
			_, err := a.GetSQLiteStatus()
			return err
		}, nil},
		{"ExportBackup over a closed database", func(a *App) { _ = a.bridgeDB.Close() }, func(_ *testing.T, a *App) error {
			_, err := a.ExportBackup()
			return err
		}, nil},
		{"PreviewBackupImport with a failing dialog", func(a *App) {
			a.pickBundle = func(context.Context, string) (string, error) { return "", dialogFailure }
		}, func(_ *testing.T, a *App) error {
			_, err := a.PreviewBackupImport()
			return err
		}, dialogFailure},
		{"ConfirmBackupImport without the database path", func(a *App) {
			a.resolveBridgeDBPath = func() (string, error) { return "", pathFailure }
		}, func(t *testing.T, a *App) error {
			_, err := a.ConfirmBackupImport(previewedBundle(t, a))
			return err
		}, pathFailure},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			app := backupApp(t, lifecycle.StateReady)
			tc.breakIt(app)

			err := tc.call(t, app)

			if code, _ := apperr.CodeOf(err); code != apperr.CodeInternal {
				t.Fatalf("err = %v (code %q), want internal", err, code)
			}
			if tc.cause != nil && !errors.Is(err, tc.cause) {
				t.Fatalf("err = %v, want it to carry %v", err, tc.cause)
			}
		})
	}
}

// TestBackupAnswersWhileSyncIsBroken pins that backup and restore stay usable when the sync
// module failed its wiring (no changelog recorder): restore is the recovery tool for exactly that
// kind of broken state, so it waits only for the database.
func TestBackupAnswersWhileSyncIsBroken(t *testing.T) {
	t.Parallel()
	app := backupApp(t, lifecycle.StateReady)
	app.settleModules(moduleSync)
	if status, _ := app.moduleSet().registry.Status(moduleSync); status.State != lifecycle.StateFailed {
		t.Fatalf("sync = %+v, want failed: the changelog recorder is not wired", status)
	}

	for _, binding := range backupBindings {
		t.Run(binding.name, func(t *testing.T) {
			served, err := binding.call(t, app)
			assertModuleAnswer(t, served, err, "", "")
		})
	}
}
