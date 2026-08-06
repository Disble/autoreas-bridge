package domain

import (
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// intPtr returns a pointer to v, for building optional patch fields.
func intPtr(v int) *int { return &v }

// floatPtr returns a pointer to v, for building optional patch fields.
func floatPtr(v float64) *float64 { return &v }

func TestApplyCompletionStateMachineFinishesAnimeWhenProgressReachesTotal(t *testing.T) {
	t.Parallel()

	patch := ApplyCompletionStateMachine(contracts.AnimePatch{NroCapVisto: floatPtr(12)}, floatPtr(12))

	if patch.Estado == nil {
		t.Fatalf("expected the completed progress to force an estado, got nil")
	}
	if *patch.Estado != 1 {
		t.Fatalf("expected estado 1 (Finalizado), got %d", *patch.Estado)
	}
}

// An explicit estado is the user's own decision, arriving from the mobile state
// sheet or the desktop editor. It MUST survive a patch that also carries the
// current progress: mobile's buildSetEstadoPatch always sends episodesWatched
// alongside status, so a fully-watched anime could otherwise never leave
// Finalizado -- "En pausa" and "No me gusto" were silently rewritten to 1.
func TestApplyCompletionStateMachineKeepsAnExplicitEstadoOnAFullyWatchedAnime(t *testing.T) {
	t.Parallel()

	for _, estado := range []int{0, 2, 3} {
		patch := ApplyCompletionStateMachine(
			contracts.AnimePatch{Estado: intPtr(estado), NroCapVisto: floatPtr(39)},
			floatPtr(39),
		)

		if patch.Estado == nil {
			t.Fatalf("estado %d: expected the explicit estado to survive, got nil", estado)
		}
		if *patch.Estado != estado {
			t.Fatalf("expected the explicit estado %d to survive, got %d", estado, *patch.Estado)
		}
	}
}

func TestApplyCompletionStateMachineLeavesPatchesWithoutProgressOrTotalUntouched(t *testing.T) {
	t.Parallel()

	if patch := ApplyCompletionStateMachine(contracts.AnimePatch{}, floatPtr(12)); patch.Estado != nil {
		t.Fatalf("expected no estado without progress, got %d", *patch.Estado)
	}
	if patch := ApplyCompletionStateMachine(contracts.AnimePatch{NroCapVisto: floatPtr(12)}, nil); patch.Estado != nil {
		t.Fatalf("expected no estado without a total, got %d", *patch.Estado)
	}
	if patch := ApplyCompletionStateMachine(contracts.AnimePatch{NroCapVisto: floatPtr(12)}, floatPtr(0)); patch.Estado != nil {
		t.Fatalf("expected no estado for a zero total, got %d", *patch.Estado)
	}
}

func TestApplyCompletionStateMachineLeavesIncompleteProgressUntouched(t *testing.T) {
	t.Parallel()

	patch := ApplyCompletionStateMachine(contracts.AnimePatch{NroCapVisto: floatPtr(11)}, floatPtr(12))

	if patch.Estado != nil {
		t.Fatalf("expected no estado for incomplete progress, got %d", *patch.Estado)
	}
}
