package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// Gateway owns legacy snapshot decoding and append-only writeback orchestration.
type Gateway struct {
	config GatewayConfig
	mapper Mapper
}

// NewGateway builds a legacy gateway with default clock and ID generators.
func NewGateway(config GatewayConfig) *Gateway {
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.NewOperationID == nil {
		config.NewOperationID = newOperationID
	}
	return &Gateway{config: config, mapper: NewMapper()}
}

// Get loads one effective legacy anime snapshot and its mapped domain value.
func (g *Gateway) Get(ctx context.Context, id string) (Snapshot, domain.Anime, error) {
	record, _, value, err := g.load(ctx, id)
	return record, value, err
}

// load retrieves and decodes one legacy snapshot by anime ID.
func (g *Gateway) load(ctx context.Context, id string) (Snapshot, AnimeRaw, domain.Anime, error) {
	if g.config.LoadSnapshot == nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, fmt.Errorf("legacy snapshot loader is required")
	}
	record, err := g.config.LoadSnapshot(ctx, id)
	if err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, err
	}
	raw, value, canonical, err := g.decode(record.CanonicalJSON)
	if err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, fmt.Errorf("decode Legacy anime %q: %w", id, err)
	}
	record.CanonicalJSON = canonical
	record.Hash = hashSnapshot(canonical)
	return record, raw, value, nil
}

// List loads every effective legacy anime snapshot and its mapped domain value.
func (g *Gateway) List(ctx context.Context) ([]Record, error) {
	if g.config.ListSnapshots == nil {
		return nil, fmt.Errorf("legacy snapshot list loader is required")
	}
	records, err := g.config.ListSnapshots(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(records))
	for id := range records {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	result := make([]Record, 0, len(ids))
	for _, id := range ids {
		record := records[id]
		_, value, canonical, decodeErr := g.decode(record.CanonicalJSON)
		if decodeErr != nil {
			return nil, fmt.Errorf("decode Legacy anime %q: %w", id, decodeErr)
		}
		record.CanonicalJSON = canonical
		record.Hash = hashSnapshot(canonical)
		result = append(result, Record{Snapshot: record, Anime: value})
	}
	return result, nil
}

// Create appends one brand-new legacy payload and returns the resulting write outcome.
func (g *Gateway) Create(ctx context.Context, raw AnimeRaw) (AnimePatchResult, error) {
	payload, err := raw.MarshalJSON()
	if err != nil {
		return AnimePatchResult{}, fmt.Errorf("marshal Legacy create %q: %w", raw.ID, err)
	}
	base := []byte(`{"_id":"` + raw.ID + `"}`)
	return g.persist(ctx, raw.ID, 0, base, payload)
}

// Update mutates one mapped domain anime and writes the result through the gateway.
func (g *Gateway) Update(ctx context.Context, command UpdateCommand) (AnimePatchResult, error) {
	for {
		result, err := g.updateOnce(ctx, command)
		if !errors.Is(err, ErrWriteReservationBusy) && !errors.Is(err, ErrWriteBaseChanged) {
			return result, err
		}
		if errors.Is(err, ErrWriteReservationBusy) {
			timer := time.NewTimer(writeReservationRetryDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return AnimePatchResult{}, ctx.Err()
			case <-timer.C:
			}
		}
	}
}

// UpdateRaw mutates one decoded legacy payload and writes the result through the gateway.
func (g *Gateway) UpdateRaw(ctx context.Context, command UpdateRawCommand) (AnimePatchResult, error) {
	for {
		result, err := g.updateRawOnce(ctx, command)
		if !errors.Is(err, ErrWriteReservationBusy) && !errors.Is(err, ErrWriteBaseChanged) {
			return result, err
		}
		if errors.Is(err, ErrWriteReservationBusy) {
			timer := time.NewTimer(writeReservationRetryDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return AnimePatchResult{}, ctx.Err()
			case <-timer.C:
			}
		}
	}
}

// updateOnce applies one domain mutation attempt and persists its merged payload.
func (g *Gateway) updateOnce(ctx context.Context, command UpdateCommand) (AnimePatchResult, error) {
	record, raw, value, err := g.loadOrCreate(ctx, command.AnimeID, command.CreateIfMissing)
	if err != nil {
		return AnimePatchResult{}, err
	}
	if command.Mutate != nil {
		command.Mutate(&value)
	}
	merged, err := g.mapper.Merge(raw, value)
	if err != nil {
		return AnimePatchResult{}, err
	}
	desired, err := merged.MarshalJSON()
	if err != nil {
		return AnimePatchResult{}, fmt.Errorf("marshal desired Legacy anime %q: %w", command.AnimeID, err)
	}
	if bytes.Equal(desired, record.CanonicalJSON) {
		return AnimePatchResult{AnimeID: command.AnimeID, Outcome: AnimePatchOutcomeNoOp, ModifiedAt: record.ModifiedAt}, nil
	}
	if command.Base != nil && *command.Base != record.ModifiedAt {
		return g.recordConflict(ctx, record, desired)
	}
	return g.persist(ctx, command.AnimeID, record.ModifiedAt, record.CanonicalJSON, desired)
}

// updateRawOnce applies one raw mutation attempt and persists its validated payload.
func (g *Gateway) updateRawOnce(ctx context.Context, command UpdateRawCommand) (AnimePatchResult, error) {
	record, raw, value, err := g.loadOrCreate(ctx, command.AnimeID, command.CreateIfMissing)
	if err != nil {
		return AnimePatchResult{}, err
	}
	if command.Mutate != nil {
		if err := command.Mutate(&raw, &value); err != nil {
			return AnimePatchResult{}, err
		}
	}
	desired, err := raw.MarshalJSON()
	if err != nil {
		return AnimePatchResult{}, fmt.Errorf("marshal desired Legacy anime %q: %w", command.AnimeID, err)
	}
	if _, _, _, err := g.decode(desired); err != nil {
		return AnimePatchResult{}, fmt.Errorf("validate desired Legacy anime %q: %w", command.AnimeID, err)
	}
	if bytes.Equal(desired, record.CanonicalJSON) {
		return AnimePatchResult{AnimeID: command.AnimeID, Outcome: AnimePatchOutcomeNoOp, ModifiedAt: record.ModifiedAt}, nil
	}
	if command.Base != nil && *command.Base != record.ModifiedAt {
		return g.recordConflict(ctx, record, desired)
	}
	return g.persist(ctx, command.AnimeID, record.ModifiedAt, record.CanonicalJSON, desired)
}

// BatchOperation describes one desired record replacement in a batch rewrite.
type BatchOperation struct {
	AnimeID string
	Base    Snapshot
	Desired []byte
}

// ApplyBatch applies a coordinated set of raw mutations directly into SQLite.
//
// SDD-55 Slice B: this used to drive a full-file `animes.dat` replacement
// journal (rename/backup/promote, see the deleted legacy/batch.go). With the
// file channel gone, a batch is just several writes sharing one BatchID,
// staged and finalized together the same way persist() finalizes a single
// write (ADR-55-1) -- no file journal, checkpoint, or self-echo tracking.
func (g *Gateway) ApplyBatch(ctx context.Context, operations []BatchOperation) (AnimePatchResult, error) {
	if len(operations) == 0 {
		return AnimePatchResult{Outcome: AnimePatchOutcomeNoOp}, nil
	}
	if g.config.Operations == nil {
		return AnimePatchResult{}, fmt.Errorf("write-base store is required")
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
	if err := g.config.Operations.FinalizeBatch(ctx, batchID, g.config.Now().UnixMilli()); err != nil {
		return AnimePatchResult{}, err
	}
	if err := g.DrainOutbox(ctx); err != nil {
		return AnimePatchResult{}, err
	}
	last := prepared[len(prepared)-1]
	return AnimePatchResult{AnimeID: last.AnimeID, Outcome: AnimePatchOutcomeApplied, ModifiedAt: last.IntendedModifiedAt}, nil
}

// loadOrCreate loads an anime or builds an empty legacy record when creation is allowed.
func (g *Gateway) loadOrCreate(ctx context.Context, animeID string, createIfMissing bool) (Snapshot, AnimeRaw, domain.Anime, error) {
	record, raw, value, err := g.load(ctx, animeID)
	if err == nil || !createIfMissing || !errors.Is(err, contracts.ErrAnimeNotFound) {
		return record, raw, value, err
	}
	if err := json.Unmarshal([]byte(`{"_id":"`+animeID+`"}`), &raw); err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, err
	}
	value, err = g.mapper.ToDomain(raw)
	if err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, err
	}
	record = Snapshot{AnimeID: animeID, CanonicalJSON: []byte(`{"_id":"` + animeID + `"}`)}
	record.Hash = hashSnapshot(record.CanonicalJSON)
	return record, raw, value, nil
}
