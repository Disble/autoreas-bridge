package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

// Recover reconciles staged write operations after startup or a crash.
//
// SDD-55 Slice B: with the file channel removed, a staged-but-not-finalized
// operation has no external ground truth to reconcile against -- SQLite
// Finalize is the only durable write step left, and it is already idempotent
// (internal/sync write_base_store.go finalizeWriteOperation upserts
// anime_snapshots only when the intended write still wins the modified_at
// race). Recovery therefore simply retries Finalize/FinalizeBatch for every
// staged operation found at startup.
func (g *Gateway) Recover(ctx context.Context) error {
	if g.config.Operations == nil {
		return fmt.Errorf("write-base store is required")
	}
	operations, err := g.config.Operations.ListStaged(ctx)
	if err != nil {
		return err
	}
	for len(operations) > 0 {
		remaining, err := g.recoverNext(ctx, operations)
		if err != nil {
			return err
		}
		operations = remaining
	}
	return nil
}

// recoverNext recovers the next staged operation or batch.
func (g *Gateway) recoverNext(ctx context.Context, operations []WriteOperation) ([]WriteOperation, error) {
	operation := operations[0]
	if operation.BatchID != "" && operation.BatchSize > 1 {
		batch, remaining := splitRecoveryBatch(operations, operation.BatchID)
		return remaining, g.recoverBatch(ctx, batch)
	}
	return operations[1:], g.recoverOperation(ctx, operation)
}

// splitRecoveryBatch separates operations belonging to one recovery batch.
func splitRecoveryBatch(operations []WriteOperation, batchID string) ([]WriteOperation, []WriteOperation) {
	batch, remaining := make([]WriteOperation, 0, len(operations)), make([]WriteOperation, 0, len(operations))
	for _, candidate := range operations {
		if candidate.BatchID == batchID {
			batch = append(batch, candidate)
		} else {
			remaining = append(remaining, candidate)
		}
	}
	sortBatchOperations(batch)
	return batch, remaining
}

// recoverOperation retries the idempotent Finalize step for one staged operation.
func (g *Gateway) recoverOperation(ctx context.Context, operation WriteOperation) error {
	return g.config.Operations.Finalize(ctx, operation.OperationID, g.config.Now().UnixMilli())
}

// recoverBatch retries the idempotent FinalizeBatch step for a staged batch.
// A batch already fully finalized reports ErrWriteOperationNotFound (no
// remaining staged rows to select), which recovery treats as already done.
func (g *Gateway) recoverBatch(ctx context.Context, operations []WriteOperation) error {
	batchID := operations[0].BatchID
	if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil && !errors.Is(err, ErrWriteOperationNotFound) {
		return err
	}
	return nil
}

// sortBatchOperations orders staged operations by batch position and ID.
func sortBatchOperations(operations []WriteOperation) {
	sort.Slice(operations, func(i, j int) bool {
		if operations[i].BatchOrder == operations[j].BatchOrder {
			return operations[i].OperationID < operations[j].OperationID
		}
		return operations[i].BatchOrder < operations[j].BatchOrder
	})
}
