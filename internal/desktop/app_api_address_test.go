package desktop

import (
	"context"
	"strings"
	"testing"

	sharedlogger "autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/settings"
)

func TestGetAPIAddressIsEmptyWithoutASettingsStore(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = nil

	if got := app.GetAPIAddress(); got != "" {
		t.Fatalf("GetAPIAddress = %q, want empty when settings are unavailable", got)
	}
}

func TestSetAPIAddressRoundTripsThroughSettings(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if got := app.GetAPIAddress(); got != "" {
		t.Fatalf("GetAPIAddress = %q, want empty before anything is configured", got)
	}
	if result := app.SetAPIAddress("0.0.0.0:9999"); result != "ok" {
		t.Fatalf("SetAPIAddress = %q, want \"ok\"", result)
	}
	if got := app.GetAPIAddress(); got != "0.0.0.0:9999" {
		t.Fatalf("GetAPIAddress = %q, want the persisted address", got)
	}
}

// Rejecting at the binding is what keeps a typo from becoming a boot problem.
// The value must not reach the database, because the next start would read it,
// discard it and bind the default -- correct, but silently different from what
// the user believes they configured.
func TestSetAPIAddressRefusesAnUnusableValueWithoutPersistingIt(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if result := app.SetAPIAddress("0.0.0.0:9999"); result != "ok" {
		t.Fatalf("SetAPIAddress = %q, want \"ok\"", result)
	}
	if app.SetAPIAddress("not-a-port") == "ok" {
		t.Fatal("SetAPIAddress accepted an unusable address")
	}
	if got := app.GetAPIAddress(); got != "0.0.0.0:9999" {
		t.Fatalf("GetAPIAddress = %q, want the previous address left intact", got)
	}
}

func TestSetAPIAddressClearsBackToTheDefault(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if result := app.SetAPIAddress("9999"); result != "ok" {
		t.Fatalf("SetAPIAddress = %q, want \"ok\"", result)
	}
	if result := app.SetAPIAddress(""); result != "ok" {
		t.Fatalf("SetAPIAddress(\"\") = %q, want \"ok\"", result)
	}
	if got := app.GetAPIAddress(); got != "" {
		t.Fatalf("GetAPIAddress = %q, want empty after clearing", got)
	}
	if got := app.resolveAPIAddr(); got != "0.0.0.0:9876" {
		t.Fatalf("resolveAPIAddr = %q, want the shipped default", got)
	}
}

func TestResolveAPIAddrUsesThePersistedSetting(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if result := app.SetAPIAddress("9999"); result != "ok" {
		t.Fatalf("SetAPIAddress = %q, want \"ok\"", result)
	}
	if got := app.resolveAPIAddr(); got != "0.0.0.0:9999" {
		t.Fatalf("resolveAPIAddr = %q, want the persisted address", got)
	}
}

// This is the case the whole mechanism exists for: the port is taken, the
// application cannot serve, and the user has no working UI to fix it from.
func TestResolveAPIAddrLetsTheEnvironmentOverrideAStoredAddress(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = newRenameSettingsStore(t)

	if result := app.SetAPIAddress("0.0.0.0:9999"); result != "ok" {
		t.Fatalf("SetAPIAddress = %q, want \"ok\"", result)
	}
	app.getenvFn = func(name string) string {
		if name == "AUTOREAS_BRIDGE_ADDR" {
			return "127.0.0.1:7777"
		}
		return ""
	}

	if got := app.resolveAPIAddr(); got != "127.0.0.1:7777" {
		t.Fatalf("resolveAPIAddr = %q, want the environment override", got)
	}
}

func TestResolveAPIAddrFallsBackToTheDefaultWithoutASettingsStore(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = nil

	if got := app.resolveAPIAddr(); got != "0.0.0.0:9876" {
		t.Fatalf("resolveAPIAddr = %q, want the shipped default", got)
	}
}

// panickingSettingsStore stands in for the unusable database the app harness
// installs at startup: its methods panic instead of returning an error, which
// is the failure canUseBridgeDB already guards against elsewhere. The embedded
// pointer is left nil on purpose -- that is what makes the call panic.
type panickingSettingsStore struct {
	*settings.SQLiteStore
}

// A settings boundary that panics must not stop the bridge from serving. This
// is the case that took startup down when the address was first wired in.
func TestResolveAPIAddrSurvivesASettingsStoreThatPanics(t *testing.T) {
	t.Parallel()

	app := newAppTestApp(t)
	app.settingsStore = panickingSettingsStore{}

	if got := app.resolveAPIAddr(); got != "0.0.0.0:9876" {
		t.Fatalf("resolveAPIAddr = %q, want the shipped default", got)
	}
}

// mentionsIgnoredAddress reports whether any log entry names the value that was
// discarded. Matching on the value rather than on entry count is what makes the
// assertion about this warning instead of about logging in general.
func mentionsIgnoredAddress(entries []sharedlogger.LogEntry, value string) bool {
	for _, entry := range entries {
		if strings.Contains(entry.Message, value) {
			return true
		}
	}
	return false
}

// The warning is the only signal that a stored address was discarded. Without
// it the bridge binds something other than what the settings screen shows and
// says nothing, so the message is asserted rather than assumed.
func TestResolveAPIAddrWarnsAboutAStoredAddressItCannotUse(t *testing.T) {
	t.Parallel()

	store := newRenameSettingsStore(t)
	if err := store.SetAPIAddr(context.Background(), "garbage"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := newAppTestApp(t)
	app.settingsStore = store
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)

	if got := app.resolveAPIAddr(); got != "0.0.0.0:9876" {
		t.Fatalf("resolveAPIAddr = %q, want the shipped default", got)
	}
	if !mentionsIgnoredAddress(memLogger.Recent(), "garbage") {
		t.Fatalf("expected a warning naming the ignored address, got %#v", memLogger.Recent())
	}
}

// The other half of the same guard: a usable address must not produce a warning
// about being ignored, or the message stops meaning anything.
func TestResolveAPIAddrStaysQuietWhenTheStoredAddressIsUsable(t *testing.T) {
	t.Parallel()

	store := newRenameSettingsStore(t)
	if err := store.SetAPIAddr(context.Background(), "0.0.0.0:9999"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	memLogger := sharedlogger.NewMemLogger(sharedlogger.MemLoggerConfig{})
	app := newAppTestApp(t)
	app.settingsStore = store
	app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)

	if got := app.resolveAPIAddr(); got != "0.0.0.0:9999" {
		t.Fatalf("resolveAPIAddr = %q, want the persisted address", got)
	}
	if mentionsIgnoredAddress(memLogger.Recent(), "0.0.0.0:9999") {
		t.Fatalf("a usable address was reported as ignored: %#v", memLogger.Recent())
	}
}

// Logging is best effort. Startup wires the shared logger after some of the
// runtime, so a rejected address must not turn a missing logger into a panic.
func TestResolveAPIAddrRejectsAnAddressWithoutALoggerPresent(t *testing.T) {
	t.Parallel()

	store := newRenameSettingsStore(t)
	if err := store.SetAPIAddr(context.Background(), "garbage"); err != nil {
		t.Fatalf("SetAPIAddr: %v", err)
	}
	app := newAppTestApp(t)
	app.settingsStore = store
	app.sharedLogger = nil

	if got := app.resolveAPIAddr(); got != "0.0.0.0:9876" {
		t.Fatalf("resolveAPIAddr = %q, want the shipped default", got)
	}
}
