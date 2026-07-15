package main

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	bridgeSync "autoreas-bridge/internal/sync"
)

// TestAppStartupWiresBridgeNativeRegistryIntoAnimeRuntimeConfigs covers SDD-48
// ADR-48-2's composition-root wiring: the SAME BridgeNativeRegistry instance
// constructed at startup must be injected into StartupCoordinatorConfig,
// LegacyPullServiceConfig, and RuntimeWatcherConfig.
func TestAppStartupWiresBridgeNativeRegistryIntoAnimeRuntimeConfigs(t *testing.T) {
	t.Parallel()

	wantDB := &sql.DB{}
	registry := &stubAppBridgeNativeRegistry{}
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return wantDB, nil }
	app.newBridgeNativeRegistry = func(db *sql.DB) anime.BridgeNativeRegistry {
		if db != wantDB {
			t.Fatal("expected registry factory to receive the bootstrapped bridge db")
		}
		return registry
	}

	var gotCoordinatorOwnership, gotPullOwnership, gotWatcherOwnership anime.BridgeNativeRegistry
	app.newStartupCoordinator = func(config anime.StartupCoordinatorConfig) anime.StartupCoordinator {
		gotCoordinatorOwnership = config.Ownership
		return &stubAppCoordinator{}
	}
	app.newLegacyPullService = func(config anime.LegacyPullServiceConfig) anime.LegacyPullService {
		gotPullOwnership = config.Ownership
		return &stubAnimeLegacyPullService{}
	}
	app.newRuntimeWatcher = func(config anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		gotWatcherOwnership = config.Ownership
		return &stubAppRuntimeWatcher{}
	}

	app.startup(context.Background())

	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
	if app.bridgeNativeRegistry != registry {
		t.Fatal("expected app.bridgeNativeRegistry to be the constructed instance")
	}
	if gotCoordinatorOwnership != registry {
		t.Fatal("expected StartupCoordinatorConfig.Ownership to receive the constructed registry")
	}
	if gotPullOwnership != registry {
		t.Fatal("expected LegacyPullServiceConfig.Ownership to receive the constructed registry")
	}
	if gotWatcherOwnership != registry {
		t.Fatal("expected RuntimeWatcherConfig.Ownership to receive the constructed registry")
	}
}

// TestAppStartupRunsBridgeNativeRestoreBeforeAnimeRuntimeStarts covers
// ADR-48-5's ordering requirement: the one-time restore repair MUST run
// synchronously before startAnimeObservers launches the async catch-up
// coordinator/watcher, so the restored ids' registration is committed
// before either reconcile path loads ownedIDs.
func TestAppStartupRunsBridgeNativeRestoreBeforeAnimeRuntimeStarts(t *testing.T) {
	t.Parallel()

	var order []string
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return &sql.DB{}, nil }
	app.restoreBridgeNativeAnimes = func(context.Context) error {
		order = append(order, "restore")
		return nil
	}
	app.newStartupCoordinator = func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
		order = append(order, "startup-coordinator")
		return &stubAppCoordinator{}
	}
	app.newLegacyPullService = func(anime.LegacyPullServiceConfig) anime.LegacyPullService {
		order = append(order, "legacy-pull")
		return &stubAnimeLegacyPullService{}
	}
	app.newRuntimeWatcher = func(anime.RuntimeWatcherConfig) anime.RuntimeWatcher {
		order = append(order, "runtime-watcher")
		return &stubAppRuntimeWatcher{}
	}

	app.startup(context.Background())

	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
	if len(order) == 0 || order[0] != "restore" {
		t.Fatalf("expected restore to run before any anime runtime construction, got order %v", order)
	}
}

// TestAppStartupAbortsWhenBridgeNativeRestoreFails covers the fail-closed
// startup contract: a restore error must abort startup (mirroring the
// existing bootstrapBridgeDB/resolveAnimeDataPath error handling) rather
// than silently continuing with a possibly-unregistered ownership state.
func TestAppStartupAbortsWhenBridgeNativeRestoreFails(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("restore boom")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return &sql.DB{}, nil }
	app.restoreBridgeNativeAnimes = func(context.Context) error { return wantErr }
	app.newStartupCoordinator = func(anime.StartupCoordinatorConfig) anime.StartupCoordinator {
		t.Fatal("expected startup to abort before constructing the anime runtime")
		return nil
	}

	app.startup(context.Background())

	if !errors.Is(app.startupErr, wantErr) {
		t.Fatalf("expected startupErr %v, got %v", wantErr, app.startupErr)
	}
}

// TestAppStartupRegistersNewAnimeAsOwnedThroughRealBridgeDB is the SDD-48
// end-to-end proof over a REAL bridge.db: after a full app.startup(), a
// season/bridge-created anime (via a.animeWrite.CreateAnime, wired with
// WriteServiceDeps.Ownership) must be registered in bridge_owned_animes, so
// a subsequent reconcile-absence never soft-deletes it.
func TestAppStartupRegistersNewAnimeAsOwnedThroughRealBridgeDB(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "bridge.db")
	app := newAppTestApp(t)
	app.bootstrapBridgeDB = func() (*sql.DB, error) { return bridgeSync.OpenBridgeDB(dbPath) }
	// Use the REAL registry/restore defaults (not the fake test doubles) so
	// this test proves the actual composition-root wiring end to end.
	app.newBridgeNativeRegistry = nil
	app.restoreBridgeNativeAnimes = nil
	t.Cleanup(func() {
		if app.bridgeDB != nil {
			_ = app.bridgeDB.Close()
		}
	})

	app.startup(context.Background())
	if app.startupErr != nil {
		t.Fatalf("expected startupErr nil, got %v", app.startupErr)
	}
	if app.animeWrite == nil {
		t.Fatal("expected animeWrite to be constructed by startup")
	}

	app.animeWrite.SetIDGen(func() string { return "e2e-owned-anime" })
	id, err := app.animeWrite.CreateAnime(context.Background(), contracts.AnimeCreate{
		Nombre: "E2E Owned", Pagina: "p", Section: "Sin ver", Orden: 1,
	})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "e2e-owned-anime" {
		t.Fatalf("expected generated id, got %q", id)
	}

	owned, err := app.bridgeNativeRegistry.ListOwnedIDs(context.Background())
	if err != nil {
		t.Fatalf("ListOwnedIDs: %v", err)
	}
	if _, ok := owned["e2e-owned-anime"]; !ok {
		t.Fatalf("expected the newly created anime to be registered as Bridge-native, got %v", owned)
	}
}
