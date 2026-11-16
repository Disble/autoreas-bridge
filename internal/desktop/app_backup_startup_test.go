package desktop

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/tray"
)

// countBackupDialogs stubs the backup save and pick dialogs and returns how many
// times either one opened, so a refused call can be shown to open none.
func countBackupDialogs(app *App) *int {
	opened := 0
	app.saveFile = func(context.Context, string, string) (string, error) { opened++; return "", nil }
	app.pickBundle = func(context.Context, string) (string, error) { opened++; return "", nil }
	return &opened
}

// callBackupBindings calls the four backup bindings and returns each one's error.
func callBackupBindings(app *App) map[string]error {
	_, status := app.GetSQLiteStatus()
	_, export := app.ExportBackup()
	_, preview := app.PreviewBackupImport()
	_, confirm := app.ConfirmBackupImport("sum")
	return map[string]error{"GetSQLiteStatus": status, "ExportBackup": export, "PreviewBackupImport": preview, "ConfirmBackupImport": confirm}
}

// assertBackupCodes fails for every binding whose error code is not want.
func assertBackupCodes(t *testing.T, label string, calls map[string]error, want apperr.Code) {
	t.Helper()
	for name, err := range calls {
		if code, _ := apperr.CodeOf(err); code != want {
			t.Errorf("%s %s: err=%v code=%q, want %q", label, name, err, code, want)
		}
	}
}

// TestBackupThroughRealStartupWhenTheDatabaseFails drives the production
// OnStartup: before it the backup bindings are unavailable, after a failed
// database open they are failed_precondition, and in both cases they open no
// dialog, leave the pending import untouched and frontend reports are recorded.
func TestBackupThroughRealStartupWhenTheDatabaseFails(t *testing.T) {
	appOptions, app, _ := productionApp(t, "relative-copy")
	dialogs := countBackupDialogs(app)
	pending := &pendingBackupImport{path: "x.zip", bundleChecksum: "sum"}
	app.pendingBackupImport = pending
	assertBackupCodes(t, "before startup", callBackupBindings(app), apperr.CodeUnavailable)
	if err := app.ReportFrontendError(FrontendErrorReport{Kind: "error", Message: "early"}); err != nil {
		t.Errorf("ReportFrontendError before startup = %v", err)
	}
	appOptions.OnStartup(context.Background())
	assertBackupCodes(t, "after the database failed", callBackupBindings(app), apperr.CodeFailedPrecondition)
	if *dialogs != 0 || app.pendingBackupImport != pending {
		t.Errorf("dialogs = %d, pending changed = %v", *dialogs, app.pendingBackupImport != pending)
	}
	if err := app.ReportFrontendError(FrontendErrorReport{Kind: "error", Message: "late"}); err != nil {
		t.Errorf("ReportFrontendError after the failure = %v", err)
	}
}

// TestBackupStaysReadyWhenTheHTTPServerFails asserts a failed HTTP bind fails
// the api module but leaves backup and the SQLite status answering.
func TestBackupStaysReadyWhenTheHTTPServerFails(t *testing.T) {
	appOptions, app, _ := productionApp(t, t.TempDir())
	countBackupDialogs(app)
	app.newHTTPServer = func(api.Config) api.Server { return &stubAppHTTPServer{startErr: errors.New("port taken")} }
	appOptions.OnStartup(context.Background())
	if status, _ := app.moduleSet().registry.Status(moduleAPI); status.State != "failed" {
		t.Fatalf("api = %+v, want failed", status)
	}
	if got, err := app.GetSQLiteStatus(); err != nil || got != "ok" {
		t.Fatalf("GetSQLiteStatus = %q, %v", got, err)
	}
	if _, err := app.ExportBackup(); err != nil {
		t.Fatalf("ExportBackup = %v", err)
	}
}

// TestBackupFailsWhenTheTrayFails asserts a tray failure, which stops startup
// before the database opens, leaves backup failed without opening a dialog.
func TestBackupFailsWhenTheTrayFails(t *testing.T) {
	appOptions, app, _ := productionApp(t, t.TempDir())
	app.newTrayManager = func() tray.Manager { return &tray.MockTrayManager{StartErr: errors.New("no tray")} }
	dialogs := countBackupDialogs(app)
	appOptions.OnStartup(context.Background())
	assertBackupCodes(t, "after the tray failed", callBackupBindings(app), apperr.CodeFailedPrecondition)
	if *dialogs != 0 {
		t.Errorf("dialogs = %d", *dialogs)
	}
}
