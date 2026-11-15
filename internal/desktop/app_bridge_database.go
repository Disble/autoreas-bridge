package desktop

import "context"

// initializeBridgeDatabase initializes the bridge database during startup and,
// once it opened, binds it to the backup handle.
func (a *App) initializeBridgeDatabase(ctx context.Context) bool {
	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
	// Only a real handle becomes a closer. Assigning a typed nil *sql.DB to the
	// interface would make it non-nil, so shutdown's guard would pass and Close
	// would panic on the database the failed bootstrap never opened -- which is
	// what a restart facing SQLITE_BUSY used to hit.
	if a.bridgeDB != nil {
		a.bridgeDBCloser = a.bridgeDB
	}
	if a.startupErr != nil {
		return false
	}
	a.bindBackupModule()
	return true
}

// bindBackupModule binds the bridge database to the backup handle.
// initializeBridgeDatabase calls it as soon as the database opened, before
// startup settles backup.
func (a *App) bindBackupModule() {
	a.moduleSet().backup.Bind(backupServices{db: a.bridgeDB})
}
