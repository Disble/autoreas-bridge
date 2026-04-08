package sync

// ReconcileEntry represents one side of a reconciliation comparison.
// It is semantic (NroCapVisto-centric), not storage-shaped.
//
// Tombstone handling ($$deleted) is intentionally deferred to SDD-10.
// This engine is a pure function: no I/O, no EventBus, no global state.
// Callers are responsible for emitting AnimeUpdateRequestedEvent when
// NeedsRemoteWrite is true in the returned ReconcileResult.
type ReconcileEntry struct {
	AnimeID     string
	NroCapVisto float64
	UpdatedAtMs int64
	// Missing indicates that the entry does not exist on this side (first-sync).
	Missing bool
}

// ReconcileResult is the output of a Reconcile call.
type ReconcileResult struct {
	// Winner is "local", "remote", or "tie".
	Winner            string
	MergedNroCapVisto float64
	NeedsRemoteWrite  bool
}

const (
	reconcileWinnerLocal  = "local"
	reconcileWinnerRemote = "remote"
	reconcileWinnerTie    = "tie"
)

// Reconcile applies the CRDT-like MAX rule: NroCapVisto never decreases.
// UpdatedAtMs (LWW timestamps) are intentionally ignored when selecting the
// winner; the higher chapter count always wins regardless of timestamp.
//
// Missing-side policy:
//   - local.Missing=true  → remote wins, NeedsRemoteWrite=true
//   - remote.Missing=true → local wins,  NeedsRemoteWrite=false
func Reconcile(local, remote ReconcileEntry) ReconcileResult {
	// First-sync: one side is absent.
	if local.Missing {
		return ReconcileResult{
			Winner:            reconcileWinnerRemote,
			MergedNroCapVisto: remote.NroCapVisto,
			NeedsRemoteWrite:  true,
		}
	}
	if remote.Missing {
		return ReconcileResult{
			Winner:            reconcileWinnerLocal,
			MergedNroCapVisto: local.NroCapVisto,
			NeedsRemoteWrite:  false,
		}
	}

	// Core MAX rule — exact float64 comparison, no epsilon.
	switch {
	case local.NroCapVisto > remote.NroCapVisto:
		return ReconcileResult{
			Winner:            reconcileWinnerLocal,
			MergedNroCapVisto: local.NroCapVisto,
			NeedsRemoteWrite:  false,
		}
	case remote.NroCapVisto > local.NroCapVisto:
		return ReconcileResult{
			Winner:            reconcileWinnerRemote,
			MergedNroCapVisto: remote.NroCapVisto,
			NeedsRemoteWrite:  true,
		}
	default:
		// Tie: prefer local (no write-back needed).
		return ReconcileResult{
			Winner:            reconcileWinnerTie,
			MergedNroCapVisto: local.NroCapVisto,
			NeedsRemoteWrite:  false,
		}
	}
}
