package sync

import "testing"

func TestReconcile(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		local           ReconcileEntry
		remote          ReconcileEntry
		wantWinner      string
		wantMerged      float64
		wantRemoteWrite bool
	}{
		// Spec scenario 1: Local higher chapter, remote has newer timestamp → Local wins.
		{
			name:            "local_higher_chapter_stale_remote_timestamp",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 5.0, UpdatedAtMs: 100},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 3.0, UpdatedAtMs: 200},
			wantWinner:      reconcileWinnerLocal,
			wantMerged:      5.0,
			wantRemoteWrite: false,
		},
		// Spec scenario 2: Remote higher chapter, local has newer timestamp → Remote wins.
		{
			name:            "remote_higher_chapter_stale_local_timestamp",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 3.0, UpdatedAtMs: 200},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 5.0, UpdatedAtMs: 100},
			wantWinner:      reconcileWinnerRemote,
			wantMerged:      5.0,
			wantRemoteWrite: true,
		},
		// Spec scenario 3: Equal chapters, different timestamps → Tie, no write-back.
		{
			name:            "tie_different_timestamps",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 10.5, UpdatedAtMs: 50},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 10.5, UpdatedAtMs: 999},
			wantWinner:      reconcileWinnerTie,
			wantMerged:      10.5,
			wantRemoteWrite: false,
		},
		// Spec scenario 4: Remote has higher fractional chapter but older timestamp → Remote wins.
		{
			name:            "remote_wins_fractional_older_timestamp",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 0.5, UpdatedAtMs: 1},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 1.0, UpdatedAtMs: 0},
			wantWinner:      reconcileWinnerRemote,
			wantMerged:      1.0,
			wantRemoteWrite: true,
		},
		// Spec scenario 5: Local far ahead, remote has much newer timestamp → Local wins (stale remote).
		{
			name:            "local_wins_stale_remote_with_newer_timestamp",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 12.0, UpdatedAtMs: 1000},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 0.0, UpdatedAtMs: 9999},
			wantWinner:      reconcileWinnerLocal,
			wantMerged:      12.0,
			wantRemoteWrite: false,
		},
		// Spec scenario 6: First sync, missing local → Remote wins.
		{
			name:            "first_sync_missing_local",
			local:           ReconcileEntry{AnimeID: "a1", Missing: true},
			remote:          ReconcileEntry{AnimeID: "a1", NroCapVisto: 5.0, UpdatedAtMs: 100},
			wantWinner:      reconcileWinnerRemote,
			wantMerged:      5.0,
			wantRemoteWrite: true,
		},
		// Spec scenario 7: Missing remote → Local wins, no write-back.
		{
			name:            "missing_remote",
			local:           ReconcileEntry{AnimeID: "a1", NroCapVisto: 5.0, UpdatedAtMs: 100},
			remote:          ReconcileEntry{AnimeID: "a1", Missing: true},
			wantWinner:      reconcileWinnerLocal,
			wantMerged:      5.0,
			wantRemoteWrite: false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := Reconcile(tc.local, tc.remote)
			if got.Winner != tc.wantWinner {
				t.Errorf("Winner: got %q, want %q", got.Winner, tc.wantWinner)
			}
			if got.MergedNroCapVisto != tc.wantMerged {
				t.Errorf("MergedNroCapVisto: got %v, want %v", got.MergedNroCapVisto, tc.wantMerged)
			}
			if got.NeedsRemoteWrite != tc.wantRemoteWrite {
				t.Errorf("NeedsRemoteWrite: got %v, want %v", got.NeedsRemoteWrite, tc.wantRemoteWrite)
			}
		})
	}
}
