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

// PatchOutcome mirrors the public write outcome contract.
type PatchOutcome = contracts.AnimePatchOutcome

// Anime patch outcomes mirror the transport contract values.
const (
	PatchOutcomeApplied  = contracts.AnimePatchOutcomeApplied
	PatchOutcomeNoOp     = contracts.AnimePatchOutcomeNoOp
	PatchOutcomeConflict = contracts.AnimePatchOutcomeConflict
)

// PatchResult mirrors the public write result contract.
type PatchResult = contracts.AnimePatchResult

// Writer persists one canonical legacy append or write.
type Writer interface {
	RequestWrite(context.Context, string, []byte) error
}

// ConflictWriter persists OCC conflicts for later review.
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

// WriteServiceDeps carries optional collaborators for write flows.
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

// WriteService applies canonical create and patch mutations through the legacy gateway.
type WriteService struct {
	store      snapshotLookup
	writer     Writer
	now        func() time.Time
	newID      func() string
	writeBases WriteBaseStore
	deps       WriteServiceDeps
}

// NewWriteService builds a write service over the shared snapshot store and writer.
func NewWriteService(store snapshotLookup, writer Writer) *WriteService {
	service := &WriteService{store: store, writer: writer, now: time.Now, newID: defaultAnimeID}
	if provider, ok := store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

// SetNow overrides the clock used for write timestamps.
func (s *WriteService) SetNow(now func() time.Time) {
	s.now = now
}

// SetIDGen overrides the anime id generator used by creates without explicit ids.
func (s *WriteService) SetIDGen(newID func() string) {
	s.newID = newID
}

// SetDeps overrides optional gateway collaborators for tests and runtime wiring.
func (s *WriteService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

// CreateAnime creates one canonical anime and returns its authoritative id.
func (s *WriteService) CreateAnime(ctx context.Context, create contracts.AnimeCreate) (string, error) {
	result, err := s.CreateAnimeResult(ctx, create)
	if err != nil {
		return "", err
	}
	return result.AnimeID, nil
}

// CreateAnimeResult creates one canonical anime and returns the full patch result.
func (s *WriteService) CreateAnimeResult(ctx context.Context, create contracts.AnimeCreate) (PatchResult, error) {
	return s.CreateCanonicalAnime(ctx, create, CreateMetadata{})
}

// CreateCanonicalAnime creates one canonical anime with optional bridge metadata.
func (s *WriteService) CreateCanonicalAnime(
	ctx context.Context,
	create contracts.AnimeCreate,
	metadata CreateMetadata,
) (PatchResult, error) {
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
		return PatchResult{}, err
	}
	if s.deps.Ownership == nil {
		return PatchResult{}, fmt.Errorf("register bridge-native anime %q: ownership registry is required", id)
	}
	if err := s.deps.Ownership.RegisterOwned(ctx, id); err != nil {
		return PatchResult{}, fmt.Errorf("register bridge-native anime %q: %w", id, err)
	}
	result, err := s.gateway().Create(ctx, raw)
	return fromLegacyPatchResult(result), err
}

// PatchAnime applies one canonical anime patch by id.
func (s *WriteService) PatchAnime(ctx context.Context, id string, patch contracts.AnimePatch) (PatchResult, error) {
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

// PatchAnimeResult keeps the explicit result-returning write API for callers.
func (s *WriteService) PatchAnimeResult(ctx context.Context, id string, patch contracts.AnimePatch) (PatchResult, error) {
	return s.PatchAnime(ctx, id, patch)
}

// RecoverWrites replays any durable write-base recovery journal and outbox events.
func (s *WriteService) RecoverWrites(ctx context.Context) error {
	gateway := s.gateway()
	if err := gateway.Recover(ctx); err != nil {
		return err
	}
	return gateway.DrainOutbox(ctx)
}

// RecoveryConfigured reports whether legacy recovery has enough file-path wiring to run.
func (s *WriteService) RecoveryConfigured() bool {
	if s.deps.FilePath != "" {
		return true
	}
	_, ok := s.writer.(legacyFilePathProvider)
	return ok
}

// gateway builds the legacy gateway used by write operations.
func (s *WriteService) gateway() *legacy.Gateway {
	filePath := s.deps.FilePath
	if filePath == "" {
		if provider, ok := s.writer.(legacyFilePathProvider); ok {
			filePath = provider.LegacyFilePath()
		}
	}
	config := newLegacyGatewayConfig(s.store, filePath, s.writeBases, s.deps, s.nowFuncForToken(), s.append, s.publishCommitted)
	if provider, ok := s.writer.(replacementEchoProvider); ok {
		config.ReplacementEcho = provider.ReplacementEchoRegistry()
	}
	return legacy.NewGateway(config)
}

// append writes an anime payload through the configured writer.
func (s *WriteService) append(ctx context.Context, _ string, payload []byte) error {
	if s.writer == nil {
		return legacy.NewDefiniteAppendError(fmt.Errorf("anime writer is required"))
	}
	if writer, ok := s.writer.(appendOnlyAnimeWriter); ok {
		return writer.RequestAppend(ctx, animeIDFromPayload(payload), payload)
	}
	return s.writer.RequestWrite(ctx, animeIDFromPayload(payload), payload)
}

// publishCommitted publishes a committed anime change when a publisher is configured.
func (s *WriteService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

// applyAnimePatch applies all fields from an anime patch to a domain value.
func applyAnimePatch(value *domain.Anime, patch contracts.AnimePatch, now time.Time) {
	stampLastWatched := patchChangesValue(*value, patch)
	applyAnimeScalarPatch(value, patch)
	applyAnimeDaysPatch(value, patch)
	applyAnimeStatePatch(value, patch, now, stampLastWatched)
	applyAnimeDatePatch(value, patch)
}

// applyAnimeScalarPatch applies scalar fields from an anime patch.
func applyAnimeScalarPatch(value *domain.Anime, patch contracts.AnimePatch) {
	if patch.Estado != nil {
		value.SetStatus(*patch.Estado)
	}
	if patch.NroCapVisto != nil {
		value.SetProgress(*patch.NroCapVisto)
	}
	if patch.Activo != nil {
		value.SetActive(*patch.Activo)
	}
}

// applyAnimeDaysPatch applies ordered or named day placements from a patch.
func applyAnimeDaysPatch(value *domain.Anime, patch contracts.AnimePatch) {
	if patch.DiasOrdered != nil {
		value.SetDays(orderedPatchDays(patch.DiasOrdered))
		return
	}
	if patch.Dias != nil {
		value.SetDays(namedPatchDays(patch.Dias))
	}
}

// orderedPatchDays converts ordered contract days to domain days.
func orderedPatchDays(days []contracts.MobileAnimeDay) []domain.AnimeDay {
	result := make([]domain.AnimeDay, 0, len(days))
	for _, day := range days {
		result = append(result, domain.AnimeDay{Day: day.Dia, Order: float64(day.Orden)})
	}
	return result
}

// namedPatchDays assigns sequential orders to named contract days.
func namedPatchDays(days []string) []domain.AnimeDay {
	result := make([]domain.AnimeDay, 0, len(days))
	for index, day := range days {
		result = append(result, domain.AnimeDay{Day: day, Order: float64(index + 1)})
	}
	return result
}

// applyAnimeStatePatch applies status and last-watched fields from a patch.
func applyAnimeStatePatch(value *domain.Anime, patch contracts.AnimePatch, now time.Time, stamp bool) {
	statePatch := domain.ApplyCompletionStateMachine(patch, value.TotalEpisodes)
	if statePatch.Estado != nil {
		value.SetStatus(*statePatch.Estado)
	}
	if statePatch.FechaUltCapVisto != nil {
		value.SetLastWatchedAt(timeFromMillis(*statePatch.FechaUltCapVisto))
		return
	}
	if !patch.PreserveLastWatched && stamp {
		value.SetLastWatchedAt(&now)
	}
}

// applyAnimeDatePatch applies premiere, deletion, and repetition dates.
func applyAnimeDatePatch(value *domain.Anime, patch contracts.AnimePatch) {
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

// patchChangesValue reports whether a patch changes the supplied anime value.
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

// toLegacySnapshot converts a snapshot record to the legacy gateway shape.
func toLegacySnapshot(record SnapshotRecord) legacy.Snapshot {
	return legacy.Snapshot{
		AnimeID: record.AnimeID, CanonicalJSON: append([]byte(nil), record.CanonicalJSON...),
		Hash: record.Hash, ModifiedAt: record.ModifiedAt,
	}
}

// fromLegacyPatchResult converts a legacy patch result to the service result.
func fromLegacyPatchResult(result legacy.AnimePatchResult) PatchResult {
	return PatchResult{
		AnimeID: result.AnimeID, Outcome: PatchOutcome(result.Outcome),
		ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}
}

// animeIDFromPayload extracts the anime identifier from a JSON payload.
func animeIDFromPayload(payload []byte) string {
	var envelope struct {
		ID string `json:"_id"`
	}
	_ = json.Unmarshal(payload, &envelope)
	return envelope.ID
}

// timeFromMillis converts epoch milliseconds to a UTC time pointer.
func timeFromMillis(value int64) *time.Time {
	result := time.UnixMilli(value).UTC()
	return &result
}

// nowFunc returns the current time from the service clock.
func (s *WriteService) nowFunc() time.Time {
	return s.nowFuncForToken()()
}

// nowFuncForToken returns the configured clock function.
func (s *WriteService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}

// defaultAnimeID generates an identifier for a newly created anime.
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
