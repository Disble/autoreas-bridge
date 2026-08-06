package domain

import "autoreas-bridge/internal/api/contracts"

// ApplyCompletionStateMachine forces completed progress into the finished estado.
//
// It only ever FILLS IN a missing estado. An explicit estado in the patch is the
// user's own decision and always wins, because clients send progress and state
// together: mobile's buildSetEstadoPatch always ships episodesWatched next to
// status, so inferring completion from progress alone made every state chosen on
// a fully-watched anime ("En pausa", "No me gusto", back to "Viendo") collapse
// into Finalizado.
func ApplyCompletionStateMachine(patch contracts.AnimePatch, totalCap *float64) contracts.AnimePatch {
	if patch.Estado != nil || patch.NroCapVisto == nil || totalCap == nil || *totalCap <= 0 {
		return patch
	}

	if *patch.NroCapVisto >= *totalCap {
		estado := 1
		patch.Estado = &estado
	}

	return patch
}
