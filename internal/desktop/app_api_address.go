package desktop

import (
	"fmt"
	"os"
	"strings"

	"autoreas-bridge/internal/api"
	"autoreas-bridge/internal/apperr"
)

// GetAPIAddress returns the configured HTTP listen address through the settings
// module handle, or "" when the shipped default is in use. Empty is the honest
// answer for "not configured": reporting the default here would make the field
// look chosen rather than inherited, and the two behave differently when the
// default later moves.
func (a *App) GetAPIAddress() (string, error) {
	return a.moduleSet().settings.Use(func(services settingsServices) (string, error) {
		return services.store.APIAddr(a.seasonCtx())
	})
}

// SetAPIAddress persists the address the HTTP API binds. A bare port number is
// accepted and expanded to every interface; an empty value clears the setting
// back to the shipped default.
//
// The value is validated here rather than at startup so a typo fails while the
// user is looking at it. Storing it and discarding it on the next boot would
// also work and would be worse: the bridge would bind the default while the
// settings screen still displayed the address the user thought was in use.
//
// The running listener is deliberately not rebound. Moving the port underneath
// paired devices mid-session breaks their sync without telling them, so the
// change takes effect on the next start. It runs through the settings module
// handle; an unusable value is invalid_argument.
func (a *App) SetAPIAddress(addr string) error {
	_, err := a.moduleSet().settings.Use(func(services settingsServices) (struct{}, error) {
		trimmed := strings.TrimSpace(addr)
		if trimmed != "" {
			if _, rejected := api.ResolveAddr(trimmed, nil); rejected != "" {
				return struct{}{}, apperr.InvalidArgument(fmt.Sprintf("%q is not a usable port or address", rejected))
			}
		}
		return struct{}{}, services.store.SetAPIAddr(a.seasonCtx(), trimmed)
	})
	return err
}

// resolveAPIAddr picks the address the HTTP API binds at startup: the
// environment override first, then the persisted setting, then the shipped
// default. getenvFn is the injection seam; it falls back to os.Getenv.
//
// Every failure here degrades to the next source rather than stopping. An
// unreadable settings store or an unusable stored value must not prevent the
// bridge from serving, because a bridge that will not start is the problem this
// setting was added to solve.
func (a *App) resolveAPIAddr() string {
	setting := a.storedAPIAddr()

	getenv := a.getenvFn
	if getenv == nil {
		getenv = os.Getenv
	}

	addr, rejected := api.ResolveAddr(setting, getenv)
	if rejected != "" && a.sharedLogger != nil {
		a.sharedLogger.Warnf("api", "ignoring unusable listen address %q, binding %s instead", rejected, addr)
	}
	return addr
}

// storedAPIAddr reads the persisted address, tolerating a settings boundary
// that panics as well as one that errors. The harness DB does exactly that,
// and canUseBridgeDB carries the same guard for the same reason: an unusable
// database must degrade to the default, never take startup down with it.
func (a *App) storedAPIAddr() (addr string) {
	if a.settingsStore == nil {
		return ""
	}
	defer func() {
		if recover() != nil {
			addr = ""
		}
	}()

	value, err := a.settingsStore.APIAddr(a.seasonCtx())
	if err != nil {
		return ""
	}
	return value
}
