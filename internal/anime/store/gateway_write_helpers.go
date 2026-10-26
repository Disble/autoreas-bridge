package store

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// save runs items as one save transaction through the configured save store.
func (g *Gateway) save(ctx context.Context, items []SaveItem) ([]SaveDecision, error) {
	if g.config.Saves == nil {
		return nil, fmt.Errorf("anime save store is required")
	}
	return g.config.Saves.CommitSave(ctx, SavePlan{
		Items: items, Rule: g.config.Rule,
		NewEventID: g.config.NewOperationID, Publish: g.config.PublishChanged,
	})
}

// saveOne saves one anime and reports its outcome. A conflict is recorded once
// the save transaction is closed, so the snapshot it leaves untouched and the
// conflict row never share a connection.
func (g *Gateway) saveOne(ctx context.Context, animeID string, decide func(Snapshot, bool) (SaveDecision, error)) (AnimePatchResult, error) {
	decisions, err := g.save(ctx, []SaveItem{{AnimeID: animeID, Decide: decide}})
	if err != nil {
		return AnimePatchResult{}, err
	}
	decision := decisions[0]
	if decision.Outcome == AnimePatchOutcomeConflict {
		return g.recordConflict(ctx, decision.Current, decision.Desired)
	}
	return AnimePatchResult{AnimeID: animeID, Outcome: decision.Outcome, ModifiedAt: decision.ModifiedAt}, nil
}

// decide classifies one single-anime write against its decoded stored record:
// a byte-equal result is a no-op, a stale explicit base is a conflict, and
// anything else is applied at a token past the stored one.
func (g *Gateway) decide(base *int64, record Snapshot, desired []byte) SaveDecision {
	decision := SaveDecision{
		AnimeID: record.AnimeID, Current: record, Base: record.CanonicalJSON,
		Desired: desired, ModifiedAt: record.ModifiedAt,
	}
	switch {
	case bytes.Equal(desired, record.CanonicalJSON):
		decision.Outcome = AnimePatchOutcomeNoOp
	case base != nil && *base != record.ModifiedAt:
		decision.Outcome = AnimePatchOutcomeConflict
	default:
		decision.Outcome = AnimePatchOutcomeApplied
		decision.ModifiedAt = g.stampSingle(record.ModifiedAt)
	}
	return decision
}

// stampSingle returns the modified_at of a single-anime write: now, raised to
// one past the stored token when now does not pass it.
func (g *Gateway) stampSingle(stored int64) int64 {
	intended := g.config.Now().UnixMilli()
	if intended <= stored {
		intended = stored + 1
	}
	return intended
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
