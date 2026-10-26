package store

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

// Gateway owns legacy snapshot decoding and the one-transaction save orchestration.
type Gateway struct {
	config GatewayConfig
	mapper Mapper
}

// NewGateway builds a legacy gateway with default clock and ID generators.
func NewGateway(config GatewayConfig) *Gateway {
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.NewEventID == nil {
		config.NewEventID = newEventID
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
	return g.decodeRecord(id, record)
}

// decodeRecord decodes one stored snapshot and canonicalizes its bytes and hash.
func (g *Gateway) decodeRecord(id string, record Snapshot) (Snapshot, AnimeRaw, domain.Anime, error) {
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

// Create stores one brand-new legacy payload and returns the resulting write
// outcome. An anime that already holds a stored token is not created over.
func (g *Gateway) Create(ctx context.Context, raw AnimeRaw) (AnimePatchResult, error) {
	payload, err := raw.MarshalJSON()
	if err != nil {
		return AnimePatchResult{}, fmt.Errorf("marshal Legacy create %q: %w", raw.ID, err)
	}
	base := []byte(`{"id":"` + raw.ID + `"}`)
	return g.saveOne(ctx, raw.ID, func(current Snapshot, _ bool) (SaveDecision, error) {
		if current.ModifiedAt != 0 {
			return SaveDecision{}, fmt.Errorf("create anime %q at base 0 while current is %d: %w", raw.ID, current.ModifiedAt, ErrWriteBaseChanged)
		}
		return SaveDecision{
			AnimeID: raw.ID, Outcome: AnimePatchOutcomeApplied, Current: current,
			Base: base, Desired: payload, ModifiedAt: g.stampSingle(0),
		}, nil
	})
}

// Update mutates one mapped domain anime and saves the result in one transaction.
func (g *Gateway) Update(ctx context.Context, command UpdateCommand) (AnimePatchResult, error) {
	return g.saveOne(ctx, command.AnimeID, func(current Snapshot, found bool) (SaveDecision, error) {
		record, raw, value, created, err := g.prepare(command.AnimeID, current, found, command.CreateIfMissing)
		if err != nil {
			return SaveDecision{}, err
		}
		if command.Mutate != nil {
			command.Mutate(&value, created)
		}
		merged, err := g.mapper.Merge(raw, value)
		if err != nil {
			return SaveDecision{}, err
		}
		desired, err := merged.MarshalJSON()
		if err != nil {
			return SaveDecision{}, fmt.Errorf("marshal desired Legacy anime %q: %w", command.AnimeID, err)
		}
		return g.decide(command.Base, record, desired), nil
	})
}

// UpdateRaw mutates one decoded legacy payload and saves the result in one transaction.
func (g *Gateway) UpdateRaw(ctx context.Context, command UpdateRawCommand) (AnimePatchResult, error) {
	return g.saveOne(ctx, command.AnimeID, func(current Snapshot, found bool) (SaveDecision, error) {
		record, raw, value, _, err := g.prepare(command.AnimeID, current, found, command.CreateIfMissing)
		if err != nil {
			return SaveDecision{}, err
		}
		if command.Mutate != nil {
			if err := command.Mutate(&raw, &value); err != nil {
				return SaveDecision{}, err
			}
		}
		desired, err := raw.MarshalJSON()
		if err != nil {
			return SaveDecision{}, fmt.Errorf("marshal desired Legacy anime %q: %w", command.AnimeID, err)
		}
		if _, _, _, err := g.decode(desired); err != nil {
			return SaveDecision{}, fmt.Errorf("validate desired Legacy anime %q: %w", command.AnimeID, err)
		}
		return g.decide(command.Base, record, desired), nil
	})
}

// BatchOperation describes one desired record replacement in a batch rewrite.
type BatchOperation struct {
	AnimeID string
	Base    Snapshot
	Desired []byte
}

// ApplyBatch saves a coordinated set of raw replacements in one transaction:
// every operation's base must still be the stored one, and either every
// operation is stored or none is. Operation index i is stamped now+i+1, or
// base+i+1 when that does not pass its base.
func (g *Gateway) ApplyBatch(ctx context.Context, operations []BatchOperation) (AnimePatchResult, error) {
	if len(operations) == 0 {
		return AnimePatchResult{Outcome: AnimePatchOutcomeNoOp}, nil
	}
	nowMs := g.config.Now().UnixMilli()
	items := make([]SaveItem, 0, len(operations))
	for index, operation := range operations {
		offset := int64(index + 1)
		items = append(items, SaveItem{AnimeID: operation.AnimeID, Decide: func(current Snapshot, _ bool) (SaveDecision, error) {
			return decideBatchOperation(operation, current, nowMs+offset, offset)
		}})
	}
	decisions, err := g.save(ctx, items)
	if err != nil {
		return AnimePatchResult{}, err
	}
	last := decisions[len(decisions)-1]
	return AnimePatchResult{AnimeID: last.AnimeID, Outcome: AnimePatchOutcomeApplied, ModifiedAt: last.ModifiedAt}, nil
}

// decideBatchOperation checks one batch operation's base against the stored
// snapshot and stamps it intended, raised past its base by offset when needed.
func decideBatchOperation(operation BatchOperation, current Snapshot, intended, offset int64) (SaveDecision, error) {
	if current.ModifiedAt != operation.Base.ModifiedAt {
		return SaveDecision{}, fmt.Errorf("batch write of anime %q at base %d while current is %d: %w",
			operation.AnimeID, operation.Base.ModifiedAt, current.ModifiedAt, ErrWriteBaseChanged)
	}
	if intended <= operation.Base.ModifiedAt {
		intended = operation.Base.ModifiedAt + offset
	}
	return SaveDecision{
		AnimeID: operation.AnimeID, Outcome: AnimePatchOutcomeApplied, Current: current,
		Base: operation.Base.CanonicalJSON, Desired: operation.Desired, ModifiedAt: intended,
	}, nil
}

// prepare decodes the stored snapshot of animeID, or builds an empty legacy
// record when it is missing and creation is allowed, reporting whether the
// record was synthesized.
func (g *Gateway) prepare(animeID string, current Snapshot, found, createIfMissing bool) (Snapshot, AnimeRaw, domain.Anime, bool, error) {
	if found {
		record, raw, value, err := g.decodeRecord(animeID, current)
		return record, raw, value, false, err
	}
	if !createIfMissing {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, false, contracts.ErrAnimeNotFound
	}
	var raw AnimeRaw
	if err := json.Unmarshal([]byte(`{"id":"`+animeID+`"}`), &raw); err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, false, err
	}
	value, err := g.mapper.ToDomain(raw)
	if err != nil {
		return Snapshot{}, AnimeRaw{}, domain.Anime{}, false, err
	}
	record := Snapshot{AnimeID: animeID, CanonicalJSON: []byte(`{"id":"` + animeID + `"}`)}
	record.Hash = hashSnapshot(record.CanonicalJSON)
	return record, raw, value, true, nil
}
