package legacy

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const batchGenerationRetries = 3

var errBatchGenerationChanged = errors.New("legacy file generation changed during batch replacement")

// BatchOperation describes one desired record replacement in a batch rewrite.
type BatchOperation struct {
	AnimeID string
	Base    Snapshot
	Desired []byte
}

// ApplyBatch applies a coordinated set of raw mutations through the replacement path.
func (g *Gateway) ApplyBatch(ctx context.Context, operations []BatchOperation) (AnimePatchResult, error) {
	if len(operations) == 0 {
		return AnimePatchResult{Outcome: AnimePatchOutcomeNoOp}, nil
	}
	batchID := g.config.NewOperationID()
	prepared := make([]WriteOperation, 0, len(operations))
	nowMs := g.config.Now().UnixMilli()
	for index, operation := range operations {
		intended := nowMs + int64(index+1)
		if intended <= operation.Base.ModifiedAt {
			intended = operation.Base.ModifiedAt + int64(index+1)
		}
		prepared = append(prepared, WriteOperation{
			OperationID: fmt.Sprintf("%s-%03d", batchID, index), AnimeID: operation.AnimeID,
			BatchID: batchID, BatchOrder: index, BatchSize: len(operations),
			BaseModifiedAt: operation.Base.ModifiedAt, IntendedModifiedAt: intended,
			BaseSnapshotJSON: append([]byte(nil), operation.Base.CanonicalJSON...), BaseHash: operation.Base.Hash,
			DesiredSnapshotJSON: append([]byte(nil), operation.Desired...), DesiredHash: hashSnapshot(operation.Desired),
			Status: WriteOperationStatusStaged, CreatedAtMs: nowMs,
		})
	}
	if err := g.config.Operations.StageBatch(ctx, prepared); err != nil {
		return AnimePatchResult{}, err
	}
	lines := make([][]byte, 0, len(prepared))
	for _, operation := range prepared {
		lines = append(lines, operation.DesiredSnapshotJSON)
	}
	g.rememberReplacementEchoes(lines)
	if err := g.replaceFile(ctx, batchID, lines); err != nil {
		g.forgetReplacementEchoes(lines)
		g.endReplacementEcho()
		if IsDefiniteBatchReplaceError(err) {
			_ = g.config.Operations.AbortBatch(context.Background(), batchID)
		}
		return AnimePatchResult{}, err
	}
	if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil {
		return AnimePatchResult{}, err
	}
	g.cleanupReplacement(batchID)
	if err := g.DrainOutbox(ctx); err != nil {
		return AnimePatchResult{}, err
	}
	last := prepared[len(prepared)-1]
	return AnimePatchResult{AnimeID: last.AnimeID, Outcome: AnimePatchOutcomeApplied, ModifiedAt: last.IntendedModifiedAt}, nil
}

// replaceFile serializes and executes a full legacy-file replacement.
func (g *Gateway) replaceFile(ctx context.Context, batchID string, desired [][]byte) error {
	if g.config.ReplaceFile != nil {
		return g.config.ReplaceFile(ctx, g.config.FilePath, desired)
	}
	return withExclusiveFileMutation(g.config.FilePath, func() error {
		for attempt := 0; attempt < batchGenerationRetries; attempt++ {
			err := g.replaceLegacyFileOnce(ctx, batchID, desired)
			if !errors.Is(err, errBatchGenerationChanged) {
				return err
			}
		}
		return NewDefiniteBatchReplaceError(errBatchGenerationChanged)
	})
}

// replaceLegacyFileOnce prepares, writes, and promotes one replacement attempt.
func (g *Gateway) replaceLegacyFileOnce(ctx context.Context, batchID string, desired [][]byte) error {
	content, journal, err := g.prepareReplacement(ctx, batchID, desired)
	if err != nil {
		return err
	}
	if err := g.writeReplacementTemp(ctx, journal, content); err != nil {
		return err
	}
	return g.promoteReplacement(ctx, journal)
}

// prepareReplacement reads the current file and records the replacement journal.
func (g *Gateway) prepareReplacement(ctx context.Context, batchID string, desired [][]byte) ([]byte, BatchReplacementJournal, error) {
	if err := ctx.Err(); err != nil {
		return nil, BatchReplacementJournal{}, NewDefiniteBatchReplaceError(err)
	}
	current, err := os.ReadFile(g.config.FilePath)
	if err != nil && !os.IsNotExist(err) {
		return nil, BatchReplacementJournal{}, NewDefiniteBatchReplaceError(err)
	}
	content := buildReplacementContent(current, desired)
	tempPath, backupPath := replacementPaths(g.config.FilePath, batchID)
	nowMs := g.config.Now().UnixMilli()
	journal := BatchReplacementJournal{
		BatchID: batchID, CanonicalPath: g.config.FilePath, TempPath: tempPath, BackupPath: backupPath,
		BaseFileHash: hashFileBytes(current), DesiredFileHash: hashFileBytes(content),
		Phase: BatchReplacementPhaseStaged, CreatedAtMs: nowMs, UpdatedAtMs: nowMs,
	}
	if err := g.config.Operations.StageBatchReplacement(ctx, journal); err != nil {
		return nil, BatchReplacementJournal{}, NewDefiniteBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhaseStaged); err != nil {
		return nil, BatchReplacementJournal{}, NewAmbiguousBatchReplaceError(err)
	}
	return content, journal, nil
}

// writeReplacementTemp durably writes the staged replacement content.
func (g *Gateway) writeReplacementTemp(ctx context.Context, journal BatchReplacementJournal, content []byte) error {
	_ = os.Remove(journal.TempPath)
	if err := g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhaseTempDurable); err != nil {
		return NewDefiniteBatchReplaceError(err)
	}
	if err := writeDurableFile(journal.TempPath, content); err != nil {
		_ = os.Remove(journal.TempPath)
		return err
	}
	if err := g.checkpoint(BatchReplacementPhaseTempDurable); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	return nil
}

// promoteReplacement moves the canonical file aside and installs the staged file.
func (g *Gateway) promoteReplacement(ctx context.Context, journal BatchReplacementJournal) error {
	if err := g.requireReplacementBase(journal); err != nil {
		return err
	}
	_ = os.Remove(journal.BackupPath)
	if err := g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhaseBackupMoved); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := moveCanonicalToBackup(journal.CanonicalPath, journal.BackupPath); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhaseBackupMoved); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.setReplacementPhase(ctx, journal.BatchID, BatchReplacementPhasePromoted); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := os.Rename(journal.TempPath, journal.CanonicalPath); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhasePromoted); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	return nil
}

// requireReplacementBase verifies that the canonical file still matches the journal base.
func (g *Gateway) requireReplacementBase(journal BatchReplacementJournal) error {
	latest, err := os.ReadFile(journal.CanonicalPath)
	if err != nil && !os.IsNotExist(err) {
		return NewAmbiguousBatchReplaceError(err)
	}
	if hashFileBytes(latest) != journal.BaseFileHash {
		_ = os.Remove(journal.TempPath)
		return errBatchGenerationChanged
	}
	return nil
}

// moveCanonicalToBackup renames the canonical file to its replacement backup path.
func moveCanonicalToBackup(canonicalPath, backupPath string) error {
	if _, err := os.Stat(canonicalPath); err == nil {
		return os.Rename(canonicalPath, backupPath)
	} else if !os.IsNotExist(err) {
		return err
	}
	return nil
}

// buildReplacementContent appends normalized desired records to the current file bytes.
func buildReplacementContent(current []byte, desired [][]byte) []byte {
	var buffer bytes.Buffer
	buffer.Write(current)
	if len(current) > 0 && !bytes.HasSuffix(current, []byte("\n")) {
		buffer.WriteByte('\n')
	}
	for _, line := range desired {
		buffer.Write(bytes.TrimRight(line, "\r\n"))
		buffer.WriteByte('\n')
	}
	return buffer.Bytes()
}

// writeDurableFile creates, syncs, and closes a replacement file durably.
func writeDurableFile(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return NewDefiniteBatchReplaceError(err)
	}
	if _, err := file.Write(payload); err != nil {
		_ = file.Close()
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := file.Close(); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	return nil
}

// replacementPaths derives safe temporary and backup paths for a batch replacement.
func replacementPaths(filePath, batchID string) (string, string) {
	stableID := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, batchID)
	prefix := filepath.Join(filepath.Dir(filePath), "."+filepath.Base(filePath)+"."+stableID)
	return prefix + ".replace.tmp", prefix + ".replace.bak"
}

// hashFileBytes returns the SHA-256 digest of file content.
func hashFileBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// setReplacementPhase records the current phase of a batch replacement.
func (g *Gateway) setReplacementPhase(ctx context.Context, batchID string, phase BatchReplacementPhase) error {
	return g.config.Operations.UpdateBatchReplacementPhase(ctx, batchID, phase, g.config.Now().UnixMilli())
}

// checkpoint reports a replacement phase to the optional checkpoint hook.
func (g *Gateway) checkpoint(phase BatchReplacementPhase) error {
	if g.config.ReplaceCheckpoint == nil {
		return nil
	}
	return g.config.ReplaceCheckpoint(phase)
}

// rememberReplacementEchoes registers replacement payloads for self-echo filtering.
func (g *Gateway) rememberReplacementEchoes(payloads [][]byte) {
	if g.config.ReplacementEcho == nil {
		return
	}
	for _, payload := range payloads {
		g.config.ReplacementEcho.Remember(payload)
	}
	if !g.config.ReplacementEcho.ReplacementInFlight() {
		g.config.ReplacementEcho.BeginReplacement()
	}
}

// forgetReplacementEchoes removes replacement payloads from self-echo tracking.
func (g *Gateway) forgetReplacementEchoes(payloads [][]byte) {
	if g.config.ReplacementEcho == nil {
		return
	}
	for _, payload := range payloads {
		g.config.ReplacementEcho.Forget(payload)
	}
}

// cleanupReplacement removes replacement artifacts and finalizes its journal.
func (g *Gateway) cleanupReplacement(batchID string) {
	defer g.endReplacementEcho()
	journal, err := g.config.Operations.GetBatchReplacement(context.Background(), batchID)
	if err != nil {
		return
	}
	_ = os.Remove(journal.TempPath)
	_ = os.Remove(journal.BackupPath)
	_ = g.config.Operations.UpdateBatchReplacementPhase(context.Background(), batchID, BatchReplacementPhaseFinalized, g.config.Now().UnixMilli())
}

// endReplacementEcho closes the replacement self-echo tracking window.
func (g *Gateway) endReplacementEcho() {
	if g.config.ReplacementEcho != nil {
		g.config.ReplacementEcho.EndReplacement()
	}
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
