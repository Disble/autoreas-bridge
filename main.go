// Package main is the Wails entry point. It owns only what Wails and //go:embed
// force to live beside wails.json: the embedded frontend and func main(). The
// desktop shell itself -- App, its bindings and its wiring -- lives in
// internal/desktop (ADR-017).
package main

import (
	"embed"

	"autoreas-bridge/internal/desktop"
	"github.com/wailsapp/wails/v2"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if err := wails.Run(desktop.Options(assets)); err != nil {
		println("Error:", err.Error())
	}
}
