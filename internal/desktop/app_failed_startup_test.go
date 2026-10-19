package desktop

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppShutdownAfterFailedBootstrapDoesNotPanic covers the lifecycle a failed
// bridge database bootstrap leaves behind: startup aborts before the database
// exists, and Wails still runs shutdown. Both failure shapes below end in the
// same place -- bootstrapBridgeDB returns no handle beside an error -- and
// shutdown must survive it instead of closing a database that was never opened.
func TestAppShutdownAfterFailedBootstrapDoesNotPanic(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		bootstrap func() (*sql.DB, error)
	}{
		{
			name:      "path resolution failure",
			bootstrap: func() (*sql.DB, error) { return nil, errors.New("resolve bridge db path: denied") },
		},
		{
			// The real shape of the recorded SQLITE_BUSY flake: OpenBridgeDB
			// closes the handle and reports (nil, error) when initialization fails.
			name: "initialization failure",
			bootstrap: func() (*sql.DB, error) {
				return bridgeSync.OpenBridgeDB(filepath.Join(t.TempDir(), "missing", "bridge.db"))
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			app := newAppTestApp(t)
			app.bootstrapBridgeDB = tc.bootstrap

			app.startup(context.Background())
			if app.startupErr == nil {
				t.Fatal("expected startup to report the bootstrap failure")
			}
			if app.bridgeDB != nil {
				t.Fatal("expected startup to retain no database handle when bootstrap fails")
			}

			// The assertion is the call itself: a shutdown that closes a nil
			// database handle panics instead of returning.
			app.shutdown(context.Background())
		})
	}
}
