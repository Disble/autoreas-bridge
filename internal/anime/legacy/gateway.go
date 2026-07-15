package legacy

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/api/contracts"
)

var (
	ErrWriteOperationNotFound          = errors.New("write operation not found")
	ErrWriteOperationNotStaged         = errors.New("write operation is not staged")
	ErrWriteOperationSuperseded        = errors.New("write operation was superseded")
	ErrWriteBaseNotFound               = errors.New("write base not found")
	ErrWriteReservationBusy            = errors.New("anime write reservation is busy")
	ErrWriteBaseChanged                = errors.New("anime write base changed")
	ErrAnimeChangedOutboxEventNotFound = errors.New("anime.changed outbox event not found")
)

const (
	writeReservationRetryDelay = 5 * time.Millisecond
	writeCleanupTimeout        = 5 * time.Second
)

type WriteOperationStatus string

const (
	WriteOperationStatusStaged     WriteOperationStatus = "staged"
	WriteOperationStatusCommitted  WriteOperationStatus = "committed"
	WriteOperationStatusAborted    WriteOperationStatus = "aborted"
	WriteOperationStatusSuperseded WriteOperationStatus = "superseded"
)

type WriteRecoveryAction string

const (
	WriteRecoveryActionFinalized   WriteRecoveryAction = "finalized"
	WriteRecoveryActionRetryAppend WriteRecoveryAction = "retry_append"
	WriteRecoveryActionDivergent   WriteRecoveryAction = "divergent"
)

type WriteOperation struct {
	OperationID         string
	AnimeID             string
	BaseModifiedAt      int64
	IntendedModifiedAt  int64
	BaseSnapshotJSON    []byte
	BaseHash            string
	DesiredSnapshotJSON []byte
	DesiredHash         string
	Status              WriteOperationStatus
	CreatedAtMs         int64
	CommittedAtMs       *int64
}

type WriteBase struct {
	OperationID         string
	AnimeID             string
	BaseModifiedAt      int64
	ResultingModifiedAt int64
	SnapshotJSON        []byte
	SnapshotHash        string
}

type WriteBaseStore interface {
	Stage(context.Context, WriteOperation) error
	Finalize(context.Context, string, int64) error
	Abort(context.Context, string) error
	ListStaged(context.Context) ([]WriteOperation, error)
	GetBase(context.Context, string, int64) (WriteBase, error)
	Recover(context.Context, string, string, int64) (WriteRecoveryAction, error)
}

type Snapshot struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
	ModifiedAt    int64
}

// Record is the English read contract crossing the Legacy adapter boundary.
// The lossless wire envelope stays private to the gateway implementation.
type Record struct {
	Snapshot Snapshot
	Anime    domain.Anime
}

type AnimePatchOutcome string

const (
	AnimePatchOutcomeApplied  AnimePatchOutcome = "applied"
	AnimePatchOutcomeNoOp     AnimePatchOutcome = "no_op"
	AnimePatchOutcomeConflict AnimePatchOutcome = "conflict"
)

type AnimePatchResult struct {
	AnimeID    string
	Outcome    AnimePatchOutcome
	ModifiedAt int64
	ConflictID string
}

type UpdateCommand struct {
	AnimeID         string
	Base            *int64
	CreateIfMissing bool
	Mutate          func(*domain.Anime)
}

type ConflictWriter interface {
	InsertConflict(context.Context, contracts.ConflictRecord) error
}

type GatewayConfig struct {
	LoadSnapshot   func(context.Context, string) (Snapshot, error)
	ListSnapshots  func(context.Context) (map[string]Snapshot, error)
	FilePath       string
	Operations     WriteBaseStore
	Outbox         AnimeChangedOutboxStore
	Conflicts      ConflictWriter
	Append         func(context.Context, string, []byte) error
	PublishChanged func(string, string, []byte)
	Now            func() time.Time
	NewOperationID func() string
}

type Gateway struct {
	config GatewayConfig
	mapper Mapper
}

func NewGateway(config GatewayConfig) *Gateway {
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.NewOperationID == nil {
		config.NewOperationID = newOperationID
	}
	return &Gateway{config: config, mapper: NewMapper()}
}

func (g *Gateway) Get(ctx context.Context, id string) (Snapshot, domain.Anime, error) {
	record, _, value, err := g.load(ctx, id)
	return record, value, err
}

func (g *Gateway) load(ctx context.Context, id string) (Snapshot, LegacyAnimeRaw, domain.Anime, error) {
	if g.config.LoadSnapshot == nil {
		return Snapshot{}, LegacyAnimeRaw{}, domain.Anime{}, fmt.Errorf("Legacy snapshot loader is required")
	}
	record, err := g.config.LoadSnapshot(ctx, id)
	if err != nil {
		return Snapshot{}, LegacyAnimeRaw{}, domain.Anime{}, err
	}
	raw, value, canonical, err := g.decode(record.CanonicalJSON)
	if err != nil {
		return Snapshot{}, LegacyAnimeRaw{}, domain.Anime{}, fmt.Errorf("decode Legacy anime %q: %w", id, err)
	}
	record.CanonicalJSON = canonical
	record.Hash = hashSnapshot(canonical)
	return record, raw, value, nil
}

func (g *Gateway) List(ctx context.Context) ([]Record, error) {
	if g.config.ListSnapshots == nil {
		return nil, fmt.Errorf("Legacy snapshot list loader is required")
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

func (g *Gateway) Create(ctx context.Context, raw LegacyAnimeRaw) (AnimePatchResult, error) {
	payload, err := raw.MarshalJSON()
	if err != nil {
		return AnimePatchResult{}, fmt.Errorf("marshal Legacy create %q: %w", raw.ID, err)
	}
	base := []byte(`{"_id":"` + raw.ID + `"}`)
	return g.persist(ctx, raw.ID, 0, base, payload)
}

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

func (g *Gateway) updateOnce(ctx context.Context, command UpdateCommand) (AnimePatchResult, error) {
	record, raw, value, err := g.load(ctx, command.AnimeID)
	if err != nil {
		if !command.CreateIfMissing || !errors.Is(err, contracts.ErrAnimeNotFound) {
			return AnimePatchResult{}, err
		}
		if decodeErr := json.Unmarshal([]byte(`{"_id":"`+command.AnimeID+`"}`), &raw); decodeErr != nil {
			return AnimePatchResult{}, decodeErr
		}
		value, err = g.mapper.ToDomain(raw)
		if err != nil {
			return AnimePatchResult{}, err
		}
		record = Snapshot{AnimeID: command.AnimeID, CanonicalJSON: []byte(`{"_id":"` + command.AnimeID + `"}`)}
		record.Hash = hashSnapshot(record.CanonicalJSON)
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

func (g *Gateway) persist(ctx context.Context, animeID string, baseToken int64, base, desired []byte) (AnimePatchResult, error) {
	if g.config.Operations == nil {
		return AnimePatchResult{}, fmt.Errorf("Legacy write-base store is required")
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

func (g *Gateway) recordConflict(ctx context.Context, current Snapshot, desired []byte) (AnimePatchResult, error) {
	conflictID := fmt.Sprintf("%s-%d", current.AnimeID, g.config.Now().UnixMilli())
	if g.config.Conflicts == nil {
		return AnimePatchResult{}, fmt.Errorf("Legacy conflict writer is required")
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

func (g *Gateway) decode(payload []byte) (LegacyAnimeRaw, domain.Anime, []byte, error) {
	return decode(payload)
}

func decode(payload []byte) (LegacyAnimeRaw, domain.Anime, []byte, error) {
	var raw LegacyAnimeRaw
	if err := json.Unmarshal(payload, &raw); err != nil {
		return LegacyAnimeRaw{}, domain.Anime{}, nil, err
	}
	value, err := NewMapper().ToDomain(raw)
	if err != nil {
		return LegacyAnimeRaw{}, domain.Anime{}, nil, err
	}
	canonical, err := raw.MarshalJSON()
	return raw, value, canonical, err
}

// Decode validates one Legacy payload and exposes only its English aggregate
// plus canonical bytes to callers outside the adapter.
func Decode(payload []byte) (domain.Anime, []byte, error) {
	_, value, canonical, err := decode(payload)
	return value, canonical, err
}

// DecodeDomain is a compatibility alias for the English Decode contract.
func DecodeDomain(payload []byte) (domain.Anime, []byte, error) {
	return Decode(payload)
}

func (g *Gateway) append(ctx context.Context, animeID string, payload []byte) error {
	if g.config.Append == nil {
		return NewDefiniteAppendError(fmt.Errorf("Legacy append writer is required"))
	}
	if err := g.config.Append(ctx, g.config.FilePath, payload); err != nil {
		return fmt.Errorf("append Legacy anime %q: %w", animeID, err)
	}
	return nil
}

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

func hashSnapshot(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func newOperationID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return fmt.Sprintf("write-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(value[:])
}
