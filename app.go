package main

import (
	"context"
	"database/sql"
	"fmt"

	bridgeSync "autoreas-bridge/internal/sync"
)

// App struct
type App struct {
	ctx               context.Context
	bridgeDB          *sql.DB
	startupErr        error
	bootstrapBridgeDB func() (*sql.DB, error)
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		bootstrapBridgeDB: bridgeSync.BootstrapBridgeDB,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if a.bootstrapBridgeDB == nil {
		a.bootstrapBridgeDB = bridgeSync.BootstrapBridgeDB
	}

	a.bridgeDB, a.startupErr = a.bootstrapBridgeDB()
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
