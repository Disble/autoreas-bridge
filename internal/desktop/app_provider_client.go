package desktop

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"autoreas-bridge/internal/cfclearance"
	"autoreas-bridge/internal/cfclearance/webview2"
	"autoreas-bridge/internal/events"
)

// providerSolverProfileDirName is the WebView2 solver profile folder under
// the user's cache directory, beside the cover cache
// (internal/anime/cover.DefaultCacheRoot). The engine persists the
// clearance cookie there, so a restart reuses it instead of re-solving.
const providerSolverProfileDirName = "cf-webview2"

// providerHTTPClient returns the one *http.Client every provider adapter is
// built over (ADR-030). Its transport is the Cloudflare clearance decorator,
// so each provider request crosses a challenge the same way: pass through
// when unchallenged, solve in the windowless WebView2 child when challenged,
// then replay with the clearance. The client is built on first use and shared
// from then on; the adapters clone it, so the transport is what they share.
// When the user cache directory cannot be resolved the solver profile falls
// back to the temporary directory, which costs a re-solve per start, never a
// failed start.
func (a *App) providerHTTPClient() *http.Client {
	if a.providerClient != nil {
		return a.providerClient
	}
	profileDir, err := providerSolverProfileDir()
	if err != nil {
		profileDir = filepath.Join(os.TempDir(), "autoreas-bridge", providerSolverProfileDirName)
	}
	policy := cfclearance.DefaultPolicy()
	solver := &webview2.ProcessSolver{DataDir: profileDir, Timeout: policy.SolveTimeout}
	transport := cfclearance.NewTransport(http.DefaultTransport, solver, cfclearance.NewMemoryStore(), appEventPublisher{app: a}, policy)
	a.providerClient = &http.Client{Transport: transport}
	return a.providerClient
}

// providerSolverProfileDir resolves the solver profile folder:
// <user cache>/autoreas-bridge/cf-webview2 (%LOCALAPPDATA% on Windows).
func providerSolverProfileDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve provider solver profile dir: %w", err)
	}
	return filepath.Join(base, "autoreas-bridge", providerSolverProfileDirName), nil
}

// appEventPublisher forwards clearance events to the bus the app owns at
// publish time, so the provider client can exist before the bus does; an
// event published before the bus is wired is dropped, never a panic.
type appEventPublisher struct {
	app *App
}

// Publish implements cfclearance.Publisher over the app's event bus.
func (p appEventPublisher) Publish(e events.Event) {
	if p.app.eventBus != nil {
		p.app.eventBus.Publish(e)
	}
}
