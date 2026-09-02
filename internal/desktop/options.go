package desktop

import (
	"embed"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// singleInstanceLockID identifies the running bridge instance so a second
// launch hands off to it instead of starting another window and tray icon.
const singleInstanceLockID = "autoreas-bridge-single-instance"

// Options assembles the Wails application options for the bridge app. It is the
// single entry point the root main package needs: everything the options refer
// to -- startup, shutdown, the second-instance handler, the lock id -- is
// unexported and lives in this package.
func Options(assets embed.FS) *options.App {
	return buildAppOptions(NewApp(), assets)
}

// buildAppOptions assembles the Wails application options for the bridge app.
func buildAppOptions(app *App, assets embed.FS) *options.App {
	return &options.App{
		Title:  "Autoreas Bridge",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour:  options.NewRGB(27, 38, 54),
		HideWindowOnClose: true,
		StartHidden:       true,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               singleInstanceLockID,
			OnSecondInstanceLaunch: app.onSecondInstanceLaunch,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []any{
			app,
		},
	}
}
