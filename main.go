// Package main is the Wails entry point. It owns only what Wails and //go:embed
// force to live beside wails.json: the embedded frontend, the cfclearance
// solver-mode hook and func main(). The desktop shell itself -- App, its
// bindings and its wiring -- lives in internal/desktop (ADR-017).
package main

import (
	"embed"
	"os"

	"autoreas-bridge/internal/cfclearance/webview2"
	"autoreas-bridge/internal/desktop"
	"github.com/wailsapp/wails/v2"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Solver mode: the clearance transport relaunches this executable to clear
	// a Cloudflare challenge in a never-shown WebView2 child (ADR-030). It runs
	// before Wails so no window or single-instance lock ever belongs to the
	// child; in solver mode the call never returns.
	webview2.RunSolverIfRequested(os.Args)
	if err := wails.Run(desktop.Options(assets)); err != nil {
		println("Error:", err.Error())
	}
}
