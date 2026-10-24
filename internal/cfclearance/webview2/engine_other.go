//go:build !windows

package webview2

import (
	"context"
	"io"

	"autoreas-bridge/internal/cfclearance"
)

// runChild reports that no solver child can run here.
func runChild(context.Context, string, []string, io.Writer) error {
	return cfclearance.ErrUnsupported
}

// runEngine reports that no browser engine exists on this platform.
func runEngine(engineRequest) Result {
	return Result{Error: cfclearance.ErrUnsupported.Error()}
}
