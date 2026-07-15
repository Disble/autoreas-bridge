package anime

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/legacy"
)

// bridgeNativeRestoreIDs are the two known casualties of the SDD-48 bug: bridge-
// created animes that Legacy's wholesale animes.dat rewrite dropped, causing
// the pre-fix reconcile to soft-delete them on every startup/watcher cycle.
var bridgeNativeRestoreIDs = [2]string{"P7y6ZIbvbYkefA7t", "WEh5Vro3gKMGhY6i"}

// bridgeNativeRestoreDoneKey is the app_settings one-shot guard key
// (ADR-48-4): a missing/non-"true" value means the repair has not run yet.
// A persisted flag (not state-sniffing) is deliberate -- it must never
// re-run and fight a LEGITIMATE later soft-delete of either id.
const bridgeNativeRestoreDoneKey = "sdd48_bridge_native_restore_done"

// RestoreFlagStore is the narrow, EXPORTED settings port
// restoreBridgeNativeAnimes needs: a generic get/set over a string-keyed
// flag. It is exported so the composition root (main package) can name it
// as the parameter type of its own settings-store factory hook.
// settings.SQLiteStore already implements this shape directly (Get/Set), so
// no adapter is required.
type RestoreFlagStore interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, value string) error
}

// restoreBridgeNativeAnimes (SDD-48, ADR-48-4) is the idempotent, one-time
// repair that reactivates bridgeNativeRestoreIDs and registers them as
// Bridge-native, so they survive every subsequent reconcile. Guarded by the
// app_settings flag bridgeNativeRestoreDoneKey: once true, the repair is
// skipped entirely on every future startup. It does NOT write to
// animes.dat -- Legacy would drop it anyway, and ownership now protects the
// row via the snapshot-store-only repair.
func restoreBridgeNativeAnimes(ctx context.Context, store SnapshotStore, registry BridgeNativeRegistry, settings RestoreFlagStore, now func() time.Time) error {
	done, err := settings.Get(ctx, bridgeNativeRestoreDoneKey)
	if err != nil {
		return fmt.Errorf("read bridge-native restore flag: %w", err)
	}
	if done == "true" {
		return nil
	}

	records, err := store.ListSnapshots(ctx)
	if err != nil {
		return fmt.Errorf("list snapshots for bridge-native restore: %w", err)
	}

	changed := false
	for _, id := range bridgeNativeRestoreIDs {
		record, ok := records[id]
		if !ok || !isSoftDeletedSnapshot(record) {
			// No-op: absent from the snapshot store, or already active --
			// nothing to repair for this id.
			continue
		}

		reactivated, err := reactivateBridgeNativeSnapshot(record, now)
		if err != nil {
			return fmt.Errorf("reactivate bridge-native anime %q: %w", id, err)
		}
		records[id] = reactivated
		changed = true

		if err := registry.RegisterOwned(ctx, id); err != nil {
			return fmt.Errorf("register bridge-native anime %q: %w", id, err)
		}
	}

	if changed {
		if err := store.ReplaceBaseline(ctx, records, nil); err != nil {
			return fmt.Errorf("persist bridge-native restore: %w", err)
		}
	}

	if err := settings.Set(ctx, bridgeNativeRestoreDoneKey, "true"); err != nil {
		return fmt.Errorf("set bridge-native restore flag: %w", err)
	}
	return nil
}

// RestoreBridgeNativeAnimes is the EXPORTED composition-root entry point for
// the SDD-48 (ADR-48-4/48-5) one-time restore repair. The startup sequence
// (app_startup_runtime.go) calls this synchronously, right after bridge.db
// bootstrap and BridgeNativeRegistry construction, and BEFORE
// startAnimeObservers launches the async catch-up reconcile/watcher -- so the
// restored ids' registration is durably committed before either reconcile
// path ever loads ownedIDs.
func RestoreBridgeNativeAnimes(ctx context.Context, store SnapshotStore, registry BridgeNativeRegistry, settings RestoreFlagStore, now func() time.Time) error {
	return restoreBridgeNativeAnimes(ctx, store, registry, settings, now)
}

// reactivateBridgeNativeSnapshot rewrites record's canonical JSON with
// Activo=true and FechaEliminacion cleared, bumping modified_at so mobile/
// realtime pick up the un-delete (ADR-48-4/(a)).
func reactivateBridgeNativeSnapshot(record SnapshotRecord, now func() time.Time) (SnapshotRecord, error) {
	payload, err := legacy.Reactivate(record.CanonicalJSON)
	if err != nil {
		return SnapshotRecord{}, fmt.Errorf("reactivate snapshot %q: %w", record.AnimeID, err)
	}

	return SnapshotRecord{
		AnimeID:       record.AnimeID,
		CanonicalJSON: payload,
		Hash:          HashSnapshot(payload),
		ModifiedAt:    stampModifiedAt(record.ModifiedAt, now),
	}, nil
}
