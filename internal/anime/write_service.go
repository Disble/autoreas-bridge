package anime

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/notification"
)

const animeIDAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

type AnimePatchOutcome = contracts.AnimePatchOutcome

const (
	AnimePatchOutcomeApplied  = contracts.AnimePatchOutcomeApplied
	AnimePatchOutcomeNoOp     = contracts.AnimePatchOutcomeNoOp
	AnimePatchOutcomeConflict = contracts.AnimePatchOutcomeConflict
)

type AnimePatchResult = contracts.AnimePatchResult

type AnimeWriter interface {
	RequestWrite(context.Context, string, []byte) error
}

type ConflictWriter interface {
	InsertConflict(context.Context, contracts.ConflictRecord) error
}

type writeBaseStoreProvider interface {
	WriteBaseStore() WriteBaseStore
}

type appendOnlyAnimeWriter interface {
	RequestAppend(context.Context, string, []byte) error
}

type committedAnimePublisher interface {
	PublishCommitted(string, string, []byte)
}

type legacyFilePathProvider interface {
	LegacyFilePath() string
}

type WriteServiceDeps struct {
	Conflicts ConflictWriter
	Notifier  notification.Notifier
	Logger    logger.Logger
	// OCCObserveOnly remains for source compatibility. Base-less writes alone
	// use observe-only last-write-wins; explicit stale bases are always enforced.
	OCCObserveOnly bool
	Ownership      BridgeNativeRegistry
	WriteBases     WriteBaseStore
	Publisher      EventPublisher
	FilePath       string
}

type WriteService struct {
	store      snapshotLookup
	writer     AnimeWriter
	now        func() time.Time
	newID      func() string
	writeBases WriteBaseStore
	deps       WriteServiceDeps
}

func NewWriteService(store snapshotLookup, writer AnimeWriter) *WriteService {
	service := &WriteService{store: store, writer: writer, now: time.Now, newID: defaultAnimeID}
	if provider, ok := store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

func (s *WriteService) SetNow(now func() time.Time) {
	s.now = now
}

func (s *WriteService) SetIDGen(newID func() string) {
	s.newID = newID
}

func (s *WriteService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

func (s *WriteService) CreateAnime(ctx context.Context, create contracts.AnimeCreate) (string, error) {
	result, err := s.CreateAnimeResult(ctx, create)
	if err != nil {
		return "", err
	}
	return result.AnimeID, nil
}

func (s *WriteService) CreateAnimeResult(ctx context.Context, create contracts.AnimeCreate) (AnimePatchResult, error) {
	return s.CreateCanonicalAnime(ctx, create, CreateMetadata{})
}

func (s *WriteService) CreateCanonicalAnime(
	ctx context.Context,
	create contracts.AnimeCreate,
	metadata CreateMetadata,
) (AnimePatchResult, error) {
	id := create.ID
	if id == "" {
		id = s.newID()
	}
	raw, err := legacy.NewCanonicalCreate(legacy.CanonicalCreateInput{
		ID: id, Title: create.Nombre, SourceURL: create.Pagina,
		Section: create.Section, Order: create.Orden, CreatedAt: s.nowFunc(),
		Folder: create.Carpeta, Type: create.Tipo, PremieredAtMs: create.FechaEstreno,
		TotalEpisodes: metadata.AnnouncedTotal, DurationMinutes: metadata.DurationMinutes,
		CoverURL: metadata.CoverURL,
	})
	if err != nil {
		return AnimePatchResult{}, err
	}
	if s.deps.Ownership == nil {
		return AnimePatchResult{}, fmt.Errorf("register bridge-native anime %q: ownership registry is required", id)
	}
	if err := s.deps.Ownership.RegisterOwned(ctx, id); err != nil {
		return AnimePatchResult{}, fmt.Errorf("register bridge-native anime %q: %w", id, err)
	}
	result, err := s.gateway().Create(ctx, raw)
	return fromLegacyPatchResult(result), err
}

func (s *WriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (AnimePatchResult, error) {
	result, err := s.gateway().Update(ctx, legacy.UpdateCommand{
		AnimeID:         id,
		Base:            patch.Base,
		CreateIfMissing: true,
		Mutate: func(value *domain.Anime) {
			applyAnimePatch(value, patch, s.nowFunc())
		},
	})
	return fromLegacyPatchResult(result), err
}

func (s *WriteService) PatchAnimeResult(ctx context.Context, id string, patch contracts.AnimePatch) (AnimePatchResult, error) {
	return s.PatchAnime(ctx, id, patch)
}

func (s *WriteService) RecoverWrites(ctx context.Context) error {
	gateway := s.gateway()
	if err := gateway.Recover(ctx); err != nil {
		return err
	}
	return gateway.DrainOutbox(ctx)
}

func (s *WriteService) RecoveryConfigured() bool {
	if s.deps.FilePath != "" {
		return true
	}
	_, ok := s.writer.(legacyFilePathProvider)
	return ok
}

func (s *WriteService) gateway() *legacy.Gateway {
	filePath := s.deps.FilePath
	if filePath == "" {
		if provider, ok := s.writer.(legacyFilePathProvider); ok {
			filePath = provider.LegacyFilePath()
		}
	}
	var outbox legacy.AnimeChangedOutboxStore
	if configured, ok := s.writeBases.(legacy.AnimeChangedOutboxStore); ok {
		outbox = configured
	}
	return legacy.NewGateway(legacy.GatewayConfig{
		LoadSnapshot: func(ctx context.Context, id string) (legacy.Snapshot, error) {
			record, err := s.store.GetSnapshot(ctx, id)
			return toLegacySnapshot(record), err
		},
		ListSnapshots: func(ctx context.Context) (map[string]legacy.Snapshot, error) {
			records, err := s.store.ListSnapshots(ctx)
			result := make(map[string]legacy.Snapshot, len(records))
			for id, record := range records {
				result[id] = toLegacySnapshot(record)
			}
			return result, err
		},
		FilePath:       filePath,
		Operations:     s.writeBases,
		Outbox:         outbox,
		Conflicts:      s.deps.Conflicts,
		Append:         s.append,
		PublishChanged: s.publishCommitted,
		Now:            s.nowFuncForToken(),
	})
}

func (s *WriteService) append(ctx context.Context, _ string, payload []byte) error {
	if s.writer == nil {
		return legacy.NewDefiniteAppendError(fmt.Errorf("anime writer is required"))
	}
	if writer, ok := s.writer.(appendOnlyAnimeWriter); ok {
		return writer.RequestAppend(ctx, animeIDFromPayload(payload), payload)
	}
	return s.writer.RequestWrite(ctx, animeIDFromPayload(payload), payload)
}

func (s *WriteService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

func applyAnimePatch(value *domain.Anime, patch contracts.AnimePatch, now time.Time) {
	stampLastWatched := patchChangesValue(*value, patch)
	if patch.Estado != nil {
		value.SetStatus(*patch.Estado)
	}
	if patch.NroCapVisto != nil {
		value.SetProgress(*patch.NroCapVisto)
	}
	if patch.Activo != nil {
		value.SetActive(*patch.Activo)
	}
	if patch.DiasOrdered != nil {
		days := make([]domain.AnimeDay, 0, len(patch.DiasOrdered))
		for _, day := range patch.DiasOrdered {
			days = append(days, domain.AnimeDay{Day: day.Dia, Order: float64(day.Orden)})
		}
		value.SetDays(days)
	} else if patch.Dias != nil {
		days := make([]domain.AnimeDay, 0, len(patch.Dias))
		for index, day := range patch.Dias {
			days = append(days, domain.AnimeDay{Day: day, Order: float64(index + 1)})
		}
		value.SetDays(days)
	}
	statePatch := domain.ApplyCompletionStateMachine(patch, value.TotalEpisodes)
	if statePatch.Estado != nil {
		value.SetStatus(*statePatch.Estado)
	}
	if statePatch.FechaUltCapVisto != nil {
		value.SetLastWatchedAt(timeFromMillis(*statePatch.FechaUltCapVisto))
	} else if !patch.PreserveLastWatched && stampLastWatched {
		value.SetLastWatchedAt(&now)
	}
	if patch.FechaEstreno != nil {
		value.SetPremieredAt(timeFromMillis(*patch.FechaEstreno))
	}
	if patch.FechaEliminacion != nil {
		value.SetDeletedAt(timeFromMillis(*patch.FechaEliminacion))
	}
	if patch.ClearFechaEliminacion {
		value.SetDeletedAt(nil)
	}
	if patch.RepeatAt != nil {
		value.Repeat(time.UnixMilli(*patch.RepeatAt).UTC())
	}
}

func patchChangesValue(value domain.Anime, patch contracts.AnimePatch) bool {
	if patch.RepeatAt != nil || patch.FechaUltCapVisto != nil || patch.FechaEstreno != nil ||
		patch.FechaEliminacion != nil || patch.ClearFechaEliminacion || patch.Dias != nil || patch.DiasOrdered != nil {
		return true
	}
	if patch.NroCapVisto != nil && *patch.NroCapVisto != value.Progress {
		return true
	}
	if patch.Estado != nil && (value.Status == nil || *patch.Estado != *value.Status) {
		return true
	}
	if patch.Activo != nil {
		active := value.Active == domain.TriStateTrue
		return *patch.Activo != active
	}
	return false
}

func toLegacySnapshot(record SnapshotRecord) legacy.Snapshot {
	return legacy.Snapshot{
		AnimeID: record.AnimeID, CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
		Hash: record.Hash, ModifiedAt: record.ModifiedAt,
	}
}

func fromLegacyPatchResult(result legacy.AnimePatchResult) AnimePatchResult {
	return AnimePatchResult{
		AnimeID: result.AnimeID, Outcome: AnimePatchOutcome(result.Outcome),
		ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}
}

func animeIDFromPayload(payload []byte) string {
	var envelope struct {
		ID string `json:"_id"`
	}
	_ = json.Unmarshal(payload, &envelope)
	return envelope.ID
}

func timeFromMillis(value int64) *time.Time {
	result := time.UnixMilli(value).UTC()
	return &result
}

func (s *WriteService) nowFunc() time.Time {
	return s.nowFuncForToken()()
}

func (s *WriteService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}

func defaultAnimeID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("bridge%d", time.Now().UnixNano())
	}
	for index := range buf {
		buf[index] = animeIDAlphabet[int(buf[index])%len(animeIDAlphabet)]
	}
	return string(buf)
}

var _ contracts.AnimeWriteService = (*WriteService)(nil)
