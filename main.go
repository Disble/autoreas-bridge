package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

// singleInstanceLockID identifies the running bridge instance so a second
// launch hands off to it instead of starting another window and tray icon.
const singleInstanceLockID = "autoreas-bridge-single-instance"

func main() {
	err := wails.Run(buildAppOptions(NewApp()))

	if err != nil {
		println("Error:", err.Error())
	}
}

// buildAppOptions assembles the Wails application options for the bridge app.
func buildAppOptions(app *App) *options.App {
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
