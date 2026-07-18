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

// Recover reconciles staged legacy write operations after startup or crashes.
func (g *Gateway) Recover(ctx context.Context) error {
	if g.config.Operations == nil {
		return fmt.Errorf("legacy write-base store is required")
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

// recoverOperation retries and finalizes one staged operation.
func (g *Gateway) recoverOperation(ctx context.Context, operation WriteOperation) error {
	effectiveHash, err := g.recoveryEffectiveHash(operation)
	if err != nil {
		return err
	}
	action, err := g.config.Operations.Recover(ctx, operation.OperationID, effectiveHash, g.config.Now().UnixMilli())
	if err != nil || action != WriteRecoveryActionRetryAppend {
		return err
	}
	if err := g.append(ctx, operation.AnimeID, operation.DesiredSnapshotJSON); err != nil {
		return g.abortAfterDefiniteFailure(operation.OperationID, err)
	}
	return g.config.Operations.Finalize(ctx, operation.OperationID, g.config.Now().UnixMilli())
}

// recoverBatch reconciles and finalizes a staged batch.
func (g *Gateway) recoverBatch(ctx context.Context, operations []WriteOperation) error {
	batchID := operations[0].BatchID
	if journal, err := g.config.Operations.GetBatchReplacement(ctx, batchID); err == nil {
		if err := g.resolveReplacementCheckpoint(ctx, journal); err != nil {
			return err
		}
	} else if !errors.Is(err, ErrWriteOperationNotFound) {
		return err
	}
	desiredCount, baseCount, err := g.countBatchRecoveryHashes(operations)
	if err != nil {
		return err
	}
	if desiredCount == len(operations) {
		if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil {
			return err
		}
		g.cleanupReplacement(batchID)
		return nil
	}
	if baseCount == len(operations) {
		return g.replaceRecoveredBatch(ctx, batchID, operations)
	}
	if err := g.config.Operations.MarkBatchSuperseded(ctx, batchID); err != nil {
		return err
	}
	g.cleanupReplacement(batchID)
	return nil
}

// countBatchRecoveryHashes counts operations matching desired and base hashes.
func (g *Gateway) countBatchRecoveryHashes(operations []WriteOperation) (int, int, error) {
	desiredCount, baseCount := 0, 0
	for _, operation := range operations {
		effectiveHash, err := g.recoveryEffectiveHash(operation)
		if err != nil {
			return 0, 0, err
		}
		if effectiveHash == operation.DesiredHash {
			desiredCount++
			continue
		}
		if effectiveHash == operation.BaseHash {
			baseCount++
			continue
		}
		return desiredCount, baseCount, nil
	}
	return desiredCount, baseCount, nil
}

// replaceRecoveredBatch replaces the legacy file with recovered batch lines.
func (g *Gateway) replaceRecoveredBatch(ctx context.Context, batchID string, operations []WriteOperation) error {
	lines := desiredBatchLines(operations)
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

// desiredBatchLines extracts desired payloads from batch operations.
func desiredBatchLines(operations []WriteOperation) [][]byte {
	lines := make([][]byte, 0, len(operations))
	for _, operation := range operations {
		lines = append(lines, operation.DesiredSnapshotJSON)
	}
	return lines
}

// resolveReplacementCheckpoint resumes an interrupted batch replacement.
func (g *Gateway) resolveReplacementCheckpoint(ctx context.Context, journal BatchReplacementJournal) error {
	return withExclusiveFileMutation(journal.CanonicalPath, func() error {
		files, err := replacementFiles(journal)
		if err != nil {
			return err
		}
		if files.canonicalIsDesired(journal) {
			return nil
		}
		if files.canPromoteTemp(journal) {
			return g.promoteRecoveredTemp(ctx, journal)
		}
		if files.canReplaceBase(journal) {
			return g.replaceRecoveredBase(ctx, journal, files)
		}
		if files.canRestoreBase(journal) {
			return restoreRecoveredBase(journal)
		}
		if !files.canonical.exists {
			return fmt.Errorf("batch replacement %q cannot recover missing canonical file", journal.BatchID)
		}
		return nil
	})
}

type replacementFile struct {
	hash   string
	exists bool
}

type replacementFilesState struct {
	canonical replacementFile
	temp      replacementFile
	backup    replacementFile
}

// replacementFiles reads the canonical, temporary, and backup replacement files.
func replacementFiles(journal BatchReplacementJournal) (replacementFilesState, error) {
	canonical, err := readReplacementFile(journal.CanonicalPath)
	if err != nil {
		return replacementFilesState{}, err
	}
	temp, err := readReplacementFile(journal.TempPath)
	if err != nil {
		return replacementFilesState{}, err
	}
	backup, err := readReplacementFile(journal.BackupPath)
	if err != nil {
		return replacementFilesState{}, err
	}
	return replacementFilesState{canonical: canonical, temp: temp, backup: backup}, nil
}

// readReplacementFile hashes a replacement file when it exists.
func readReplacementFile(path string) (replacementFile, error) {
	hash, exists, err := existingFileHash(path)
	return replacementFile{hash: hash, exists: exists}, err
}

// canonicalIsDesired reports whether the canonical file has the desired hash.
func (files replacementFilesState) canonicalIsDesired(journal BatchReplacementJournal) bool {
	return files.canonical.exists && files.canonical.hash == journal.DesiredFileHash
}

// canPromoteTemp reports whether the desired temporary file can be promoted.
func (files replacementFilesState) canPromoteTemp(journal BatchReplacementJournal) bool {
	return !files.canonical.exists && files.temp.exists && files.temp.hash == journal.DesiredFileHash
}

// canReplaceBase reports whether the base canonical file can be replaced.
func (files replacementFilesState) canReplaceBase(journal BatchReplacementJournal) bool {
	return files.canonical.exists && files.canonical.hash == journal.BaseFileHash && files.temp.exists && files.temp.hash == journal.DesiredFileHash
}

// canRestoreBase reports whether the base backup can be restored.
func (files replacementFilesState) canRestoreBase(journal BatchReplacementJournal) bool {
	return !files.canonical.exists && files.backup.exists && files.backup.hash == journal.BaseFileHash
}

// promoteRecoveredTemp promotes a recovered temporary replacement file.
func (g *Gateway) promoteRecoveredTemp(ctx context.Context, journal BatchReplacementJournal) error {
	if err := os.Rename(journal.TempPath, journal.CanonicalPath); err != nil {
		return fmt.Errorf("promote recovered batch %q: %w", journal.BatchID, err)
	}
	return g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhasePromoted)
}

// replaceRecoveredBase moves the current base aside and promotes the temp file.
func (g *Gateway) replaceRecoveredBase(ctx context.Context, journal BatchReplacementJournal, files replacementFilesState) error {
	if files.backup.exists && files.backup.hash != journal.BaseFileHash {
		return fmt.Errorf("batch replacement %q has ambiguous backup generation", journal.BatchID)
	}
	if err := moveRecoveredCanonical(journal, files.backup.exists); err != nil {
		return err
	}
	if err := os.Rename(journal.TempPath, journal.CanonicalPath); err != nil {
		return fmt.Errorf("promote recovered batch %q temp: %w", journal.BatchID, err)
	}
	return g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhasePromoted)
}

// moveRecoveredCanonical moves or removes the current canonical file.
func moveRecoveredCanonical(journal BatchReplacementJournal, backupExists bool) error {
	if !backupExists {
		if err := os.Rename(journal.CanonicalPath, journal.BackupPath); err != nil {
			return fmt.Errorf("move recovered batch %q canonical to backup: %w", journal.BatchID, err)
		}
		return nil
	}
	return os.Remove(journal.CanonicalPath)
}

// restoreRecoveredBase restores the replacement backup as canonical data.
func restoreRecoveredBase(journal BatchReplacementJournal) error {
	if err := os.Rename(journal.BackupPath, journal.CanonicalPath); err != nil {
		return fmt.Errorf("restore recovered batch %q canonical: %w", journal.BatchID, err)
	}
	return nil
}

// existingFileHash returns a file hash and existence flag.
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

// recoveryEffectiveHash computes the effective hash for a staged operation.
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

// isSyntheticMissingBase identifies a synthetic base for a missing anime.
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

// readEffective reads the latest non-deleted record for an anime ID.
func readEffective(path, animeID string) (effective []byte, err error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := file.Close(); err == nil && closeErr != nil {
			effective = nil
			err = fmt.Errorf("close legacy file: %w", closeErr)
		}
	}()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		updated, matched, lineErr := effectiveLine(scanner.Bytes(), animeID)
		if lineErr != nil {
			return nil, lineErr
		}
		if matched {
			effective = updated
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

// effectiveLine evaluates one legacy line for the requested anime ID.
func effectiveLine(line []byte, animeID string) ([]byte, bool, error) {
	line = bytes.TrimSpace(line)
	var envelope struct {
		ID      string `json:"_id"`
		Deleted bool   `json:"$$deleted"`
	}
	if json.Unmarshal(line, &envelope) != nil || envelope.ID != animeID {
		return nil, false, nil
	}
	if envelope.Deleted {
		return nil, true, nil
	}
	var raw AnimeRaw
	if err := json.Unmarshal(line, &raw); err != nil {
		return nil, false, err
	}
	effective, err := raw.MarshalJSON()
	return effective, true, err
}
