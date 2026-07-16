package legacy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"autoreas-bridge/internal/api/contracts"
)

func (g *Gateway) Recover(ctx context.Context) error {
	if g.config.Operations == nil {
		return fmt.Errorf("Legacy write-base store is required")
	}
	operations, err := g.config.Operations.ListStaged(ctx)
	if err != nil {
		return err
	}
	for len(operations) > 0 {
		operation := operations[0]
		if operation.BatchID != "" && operation.BatchSize > 1 {
			batch := []WriteOperation{}
			remaining := make([]WriteOperation, 0, len(operations))
			for _, candidate := range operations {
				if candidate.BatchID == operation.BatchID {
					batch = append(batch, candidate)
					continue
				}
				remaining = append(remaining, candidate)
			}
			sortBatchOperations(batch)
			if err := g.recoverBatch(ctx, batch); err != nil {
				return err
			}
			operations = remaining
			continue
		}
		effectiveHash, readErr := g.recoveryEffectiveHash(operation)
		if readErr != nil {
			return readErr
		}
		action, recoverErr := g.config.Operations.Recover(ctx, operation.OperationID, effectiveHash, g.config.Now().UnixMilli())
		if recoverErr != nil {
			return recoverErr
		}
		switch action {
		case WriteRecoveryActionFinalized:
			operations = operations[1:]
			continue
		case WriteRecoveryActionRetryAppend:
			if err := g.append(ctx, operation.AnimeID, operation.DesiredSnapshotJSON); err != nil {
				return g.abortAfterDefiniteFailure(operation.OperationID, err)
			}
			if err := g.config.Operations.Finalize(ctx, operation.OperationID, g.config.Now().UnixMilli()); err != nil {
				return err
			}
		case WriteRecoveryActionDivergent:
			operations = operations[1:]
			continue
		}
		operations = operations[1:]
	}
	return nil
}

func (g *Gateway) recoverBatch(ctx context.Context, operations []WriteOperation) error {
	batchID := operations[0].BatchID
	if journal, err := g.config.Operations.GetBatchReplacement(ctx, batchID); err == nil {
		if err := g.resolveReplacementCheckpoint(ctx, journal); err != nil {
			return err
		}
	} else if !errors.Is(err, ErrWriteOperationNotFound) {
		return err
	}
	desiredCount := 0
	baseCount := 0
	for _, operation := range operations {
		effectiveHash, readErr := g.recoveryEffectiveHash(operation)
		if readErr != nil {
			return readErr
		}
		switch effectiveHash {
		case operation.DesiredHash:
			desiredCount++
		case operation.BaseHash:
			baseCount++
		default:
			if err := g.config.Operations.MarkBatchSuperseded(ctx, operation.BatchID); err != nil {
				return err
			}
			return nil
		}
	}
	if desiredCount == len(operations) {
		if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil {
			return err
		}
		g.cleanupReplacement(batchID)
		return nil
	}
	if baseCount == len(operations) {
		lines := make([][]byte, 0, len(operations))
		for _, operation := range operations {
			lines = append(lines, operation.DesiredSnapshotJSON)
		}
		g.rememberReplacementEchoes(lines)
		if err := g.replaceFile(ctx, batchID, lines); err != nil {
			g.forgetReplacementEchoes(lines)
			g.endReplacementEcho()
			if IsDefiniteBatchReplaceError(err) {
				_ = g.config.Operations.AbortBatch(context.Background(), batchID)
			}
			return err
		}
		if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil {
			return err
		}
		g.cleanupReplacement(batchID)
		return nil
	}
	if err := g.config.Operations.MarkBatchSuperseded(ctx, batchID); err != nil {
		return err
	}
	g.cleanupReplacement(batchID)
	return nil
}

func (g *Gateway) resolveReplacementCheckpoint(ctx context.Context, journal BatchReplacementJournal) error {
	return withExclusiveFileMutation(journal.CanonicalPath, func() error {
		canonicalHash, canonicalExists, err := existingFileHash(journal.CanonicalPath)
		if err != nil {
			return err
		}
		tempHash, tempExists, err := existingFileHash(journal.TempPath)
		if err != nil {
			return err
		}
		backupHash, backupExists, err := existingFileHash(journal.BackupPath)
		if err != nil {
			return err
		}

		if canonicalExists && canonicalHash == journal.DesiredFileHash {
			return nil
		}
		if !canonicalExists && tempExists && tempHash == journal.DesiredFileHash {
			if err := os.Rename(journal.TempPath, journal.CanonicalPath); err != nil {
				return fmt.Errorf("promote recovered batch %q: %w", journal.BatchID, err)
			}
			return g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhasePromoted)
		}
		if canonicalExists && canonicalHash == journal.BaseFileHash && tempExists && tempHash == journal.DesiredFileHash {
			if backupExists && backupHash != journal.BaseFileHash {
				return fmt.Errorf("batch replacement %q has ambiguous backup generation", journal.BatchID)
			}
			if !backupExists {
				if err := os.Rename(journal.CanonicalPath, journal.BackupPath); err != nil {
					return fmt.Errorf("move recovered batch %q canonical to backup: %w", journal.BatchID, err)
				}
			} else if err := os.Remove(journal.CanonicalPath); err != nil {
				return err
			}
			if err := os.Rename(journal.TempPath, journal.CanonicalPath); err != nil {
				return fmt.Errorf("promote recovered batch %q temp: %w", journal.BatchID, err)
			}
			return g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhasePromoted)
		}
		if !canonicalExists && backupExists && backupHash == journal.BaseFileHash {
			if err := os.Rename(journal.BackupPath, journal.CanonicalPath); err != nil {
				return fmt.Errorf("restore recovered batch %q canonical: %w", journal.BatchID, err)
			}
			return nil
		}
		if !canonicalExists {
			return fmt.Errorf("batch replacement %q cannot recover missing canonical file", journal.BatchID)
		}
		return nil
	})
}

func existingFileHash(path string) (string, bool, error) {
	payload, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return hashFileBytes(payload), true, nil
}

func (g *Gateway) recoveryEffectiveHash(operation WriteOperation) (string, error) {
	effective, err := readEffective(g.config.FilePath, operation.AnimeID)
	if err == nil {
		return hashSnapshot(effective), nil
	}
	if errors.Is(err, contracts.ErrAnimeNotFound) && isSyntheticMissingBase(operation) {
		return operation.BaseHash, nil
	}
	return "", fmt.Errorf("read effective Legacy anime %q: %w", operation.AnimeID, err)
}

func isSyntheticMissingBase(operation WriteOperation) bool {
	var base map[string]json.RawMessage
	if json.Unmarshal(operation.BaseSnapshotJSON, &base) != nil || len(base) != 1 {
		return false
	}
	var id string
	if json.Unmarshal(base["_id"], &id) != nil {
		return false
	}
	return id == operation.AnimeID
}

func readEffective(path, animeID string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	var effective []byte
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		var envelope struct {
			ID      string `json:"_id"`
			Deleted bool   `json:"$$deleted"`
		}
		if json.Unmarshal(line, &envelope) != nil || envelope.ID != animeID {
			continue
		}
		if envelope.Deleted {
			effective = nil
			continue
		}
		var raw LegacyAnimeRaw
		if err := json.Unmarshal(line, &raw); err != nil {
			return nil, err
		}
		effective, err = raw.MarshalJSON()
		if err != nil {
			return nil, err
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if effective == nil {
		return nil, contracts.ErrAnimeNotFound
	}
	return effective, nil
}
