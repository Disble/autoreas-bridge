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

var errBatchGenerationChanged = errors.New("Legacy file generation changed during batch replacement")

type BatchOperation struct {
	AnimeID string
	Base    Snapshot
	Desired []byte
}

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

func (g *Gateway) replaceLegacyFileOnce(ctx context.Context, batchID string, desired [][]byte) error {
	if err := ctx.Err(); err != nil {
		return NewDefiniteBatchReplaceError(err)
	}
	current, err := os.ReadFile(g.config.FilePath)
	if err != nil && !os.IsNotExist(err) {
		return NewDefiniteBatchReplaceError(err)
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
		return NewDefiniteBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhaseStaged); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	_ = os.Remove(tempPath)
	if err := g.setReplacementPhase(ctx, batchID, BatchReplacementPhaseTempDurable); err != nil {
		return NewDefiniteBatchReplaceError(err)
	}
	if err := writeDurableFile(tempPath, content); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := g.checkpoint(BatchReplacementPhaseTempDurable); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	latest, err := os.ReadFile(g.config.FilePath)
	if err != nil && !os.IsNotExist(err) {
		return NewAmbiguousBatchReplaceError(err)
	}
	if hashFileBytes(latest) != journal.BaseFileHash {
		_ = os.Remove(tempPath)
		return errBatchGenerationChanged
	}
	_ = os.Remove(backupPath)
	if err := g.setReplacementPhase(ctx, batchID, BatchReplacementPhaseBackupMoved); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if _, err := os.Stat(g.config.FilePath); err == nil {
		if err := os.Rename(g.config.FilePath, backupPath); err != nil {
			return NewAmbiguousBatchReplaceError(err)
		}
	} else if !os.IsNotExist(err) {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhaseBackupMoved); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.setReplacementPhase(ctx, batchID, BatchReplacementPhasePromoted); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := os.Rename(tempPath, g.config.FilePath); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	if err := g.checkpoint(BatchReplacementPhasePromoted); err != nil {
		return NewAmbiguousBatchReplaceError(err)
	}
	return nil
}

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

func hashFileBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func (g *Gateway) setReplacementPhase(ctx context.Context, batchID string, phase BatchReplacementPhase) error {
	return g.config.Operations.UpdateBatchReplacementPhase(ctx, batchID, phase, g.config.Now().UnixMilli())
}

func (g *Gateway) checkpoint(phase BatchReplacementPhase) error {
	if g.config.ReplaceCheckpoint == nil {
		return nil
	}
	return g.config.ReplaceCheckpoint(phase)
}

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

func (g *Gateway) forgetReplacementEchoes(payloads [][]byte) {
	if g.config.ReplacementEcho == nil {
		return
	}
	for _, payload := range payloads {
		g.config.ReplacementEcho.Forget(payload)
	}
}

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

func (g *Gateway) endReplacementEcho() {
	if g.config.ReplacementEcho != nil {
		g.config.ReplacementEcho.EndReplacement()
	}
}

func sortBatchOperations(operations []WriteOperation) {
	sort.Slice(operations, func(i, j int) bool {
		if operations[i].BatchOrder == operations[j].BatchOrder {
			return operations[i].OperationID < operations[j].OperationID
		}
		return operations[i].BatchOrder < operations[j].BatchOrder
	})
}
