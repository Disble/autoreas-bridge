package domain

import "autoreas-bridge/internal/api/contracts"

// ApplyCompletionStateMachine forces completed progress into the finished estado.
func ApplyCompletionStateMachine(patch contracts.AnimePatch, totalCap *float64) contracts.AnimePatch {
	if patch.NroCapVisto == nil || totalCap == nil || *totalCap <= 0 {
		return patch
	}

	if *patch.NroCapVisto >= *totalCap {
		estado := 1
		patch.Estado = &estado
	}

	return patch
}
