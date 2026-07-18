package legacy

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// persist stages, appends, finalizes, and publishes one legacy write operation.
func (g *Gateway) persist(ctx context.Context, animeID string, baseToken int64, base, desired []byte) (AnimePatchResult, error) {
	if g.config.Operations == nil {
		return AnimePatchResult{}, fmt.Errorf("legacy write-base store is required")
	}
	intended := g.config.Now().UnixMilli()
	if intended <= baseToken {
		intended = baseToken + 1
	}
	operation := WriteOperation{
		OperationID: g.config.NewOperationID(), AnimeID: animeID,
		BaseModifiedAt: baseToken, IntendedModifiedAt: intended,
		BaseSnapshotJSON: append([]byte(nil), base...), BaseHash: hashSnapshot(base),
		DesiredSnapshotJSON: append([]byte(nil), desired...), DesiredHash: hashSnapshot(desired),
		Status: WriteOperationStatusStaged, CreatedAtMs: g.config.Now().UnixMilli(),
	}
	if err := g.config.Operations.Stage(ctx, operation); err != nil {
		return AnimePatchResult{}, err
	}
	if err := g.append(ctx, animeID, desired); err != nil {
		return AnimePatchResult{}, g.abortAfterDefiniteFailure(operation.OperationID, err)
	}
	if err := g.config.Operations.Finalize(ctx, operation.OperationID, g.config.Now().UnixMilli()); err != nil {
		return AnimePatchResult{}, err
	}
	if err := g.DrainOutbox(ctx); err != nil {
		return AnimePatchResult{}, err
	}
	return AnimePatchResult{AnimeID: animeID, Outcome: AnimePatchOutcomeApplied, ModifiedAt: intended}, nil
}

// recordConflict stores a write conflict between the current and desired snapshots.
func (g *Gateway) recordConflict(ctx context.Context, current Snapshot, desired []byte) (AnimePatchResult, error) {
	conflictID := fmt.Sprintf("%s-%d", current.AnimeID, g.config.Now().UnixMilli())
	if g.config.Conflicts == nil {
		return AnimePatchResult{}, fmt.Errorf("legacy conflict writer is required")
	}
	err := g.config.Conflicts.InsertConflict(ctx, contracts.ConflictRecord{
		ConflictID: conflictID, AnimeID: current.AnimeID,
		LocalSnapshotJSON:  append([]byte(nil), current.CanonicalJSON...),
		RemoteSnapshotJSON: append([]byte(nil), desired...), DetectedAtMs: g.config.Now().UnixMilli(),
	})
	if err != nil {
		return AnimePatchResult{}, err
	}
	return AnimePatchResult{AnimeID: current.AnimeID, Outcome: AnimePatchOutcomeConflict, ModifiedAt: current.ModifiedAt, ConflictID: conflictID}, nil
}

// decode delegates gateway payload decoding to the package decoder.
func (g *Gateway) decode(payload []byte) (AnimeRaw, domain.Anime, []byte, error) {
	return decode(payload)
}

// decode validates, maps, and canonicalizes one legacy payload.
func decode(payload []byte) (AnimeRaw, domain.Anime, []byte, error) {
	var raw AnimeRaw
	if err := json.Unmarshal(payload, &raw); err != nil {
		return AnimeRaw{}, domain.Anime{}, nil, err
	}
	value, err := NewMapper().ToDomain(raw)
	if err != nil {
		return AnimeRaw{}, domain.Anime{}, nil, err
	}
	canonical, err := raw.MarshalJSON()
	return raw, value, canonical, err
}

// Decode validates one Legacy payload and exposes only its English aggregate plus canonical bytes.
func Decode(payload []byte) (domain.Anime, []byte, error) {
	_, value, canonical, err := decode(payload)
	return value, canonical, err
}

// DecodeForUpdate returns the raw legacy record, domain aggregate, and canonical JSON.
func DecodeForUpdate(payload []byte) (AnimeRaw, domain.Anime, []byte, error) {
	return decode(payload)
}

// DecodeDomain is a compatibility alias for the English Decode contract.
func DecodeDomain(payload []byte) (domain.Anime, []byte, error) {
	return Decode(payload)
}

// append writes one canonical legacy payload through the configured append port.
func (g *Gateway) append(ctx context.Context, animeID string, payload []byte) error {
	if g.config.Append == nil {
		return NewDefiniteAppendError(fmt.Errorf("legacy append writer is required"))
	}
	if err := g.config.Append(ctx, g.config.FilePath, payload); err != nil {
		return fmt.Errorf("append Legacy anime %q: %w", animeID, err)
	}
	return nil
}

// abortAfterDefiniteFailure aborts a staged operation after a definite append failure.
func (g *Gateway) abortAfterDefiniteFailure(operationID string, appendErr error) error {
	if !IsDefiniteAppendError(appendErr) {
		return appendErr
	}
	cleanupCtx, cancel := context.WithTimeout(context.Background(), writeCleanupTimeout)
	defer cancel()
	if abortErr := g.config.Operations.Abort(cleanupCtx, operationID); abortErr != nil {
		return errors.Join(appendErr, fmt.Errorf("abort write operation %q after definite append failure: %w", operationID, abortErr))
	}
	return appendErr
}

// hashSnapshot returns the SHA-256 digest of a canonical snapshot.
func hashSnapshot(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// newOperationID generates a random operation identifier with a time fallback.
func newOperationID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return fmt.Sprintf("write-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(value[:])
}
