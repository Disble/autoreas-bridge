package anime

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// EditorNullableStringPatch carries an optional string field mutation.
type EditorNullableStringPatch struct {
	Present bool
	Clear   bool
	Value   string
}

// EditorNullableIntPatch carries an optional integer field mutation.
type EditorNullableIntPatch struct {
	Present bool
	Clear   bool
	Value   int
}

// EditorNullableTimePatch carries an optional millisecond timestamp mutation.
type EditorNullableTimePatch struct {
	Present   bool
	Clear     bool
	UnixMilli int64
}

// EditorStudiosPatch carries the editor studios mutation semantics.
type EditorStudiosPatch struct {
	Present bool
	Clear   bool
	Values  []string
}

// EditorCoverPatch carries the editor cover mutation semantics.
type EditorCoverPatch struct {
	Present bool
	Clear   bool
	Type    string
	Path    string
	Raw     map[string]json.RawMessage
}

// EditorPatch is the full mutable anime-editor payload.
type EditorPatch struct {
	Name            *string
	Status          *int
	Progress        *float64
	TotalEpisodes   EditorNullableIntPatch
	Kind            EditorNullableIntPatch
	Page            EditorNullableStringPatch
	Folder          EditorNullableStringPatch
	Origin          EditorNullableStringPatch
	Duration        EditorNullableIntPatch
	PremieredAt     EditorNullableTimePatch
	Genres          *[]string
	Placements      *[]contracts.MobileAnimeDay
	Active          *bool
	Cover           EditorCoverPatch
	Studios         EditorStudiosPatch
	ForbiddenFields []string
}

// SaveAnimeEditorCommand captures one editor save request.
type SaveAnimeEditorCommand struct {
	AnimeID        string
	BaseModifiedAt int64
	Patch          EditorPatch
}

// EditorService applies anime-editor mutations through the legacy gateway.
type EditorService struct {
	store      snapshotLookup
	writer     Writer
	writeBases WriteBaseStore
	now        func() time.Time
	deps       WriteServiceDeps
}

// NewEditorService builds an editor service over the shared snapshot store and writer.
func NewEditorService(store snapshotLookup, writer Writer) *EditorService {
	service := &EditorService{store: store, writer: writer, now: time.Now}
	if provider, ok := store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

// SetNow overrides the clock used for token and mutation timestamps.
func (s *EditorService) SetNow(now func() time.Time) { s.now = now }

// SetDeps overrides optional gateway collaborators for tests and recovery wiring.
func (s *EditorService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

// Save validates and persists one anime-editor mutation.
func (s *EditorService) Save(ctx context.Context, command SaveAnimeEditorCommand) (PatchResult, error) {
	if strings.TrimSpace(command.AnimeID) == "" {
		return PatchResult{}, errors.New("editor save: anime id cannot be blank")
	}
	if err := validateEditorPatch(command.Patch); err != nil {
		return PatchResult{}, err
	}
	record, err := s.store.GetSnapshot(ctx, command.AnimeID)
	if err != nil {
		return PatchResult{}, err
	}
	_, current, _, err := store.DecodeForUpdate(record.CanonicalJSON)
	if err != nil {
		return PatchResult{}, err
	}
	if err := validateEditorPatchAgainstCurrent(command.Patch, current); err != nil {
		return PatchResult{}, err
	}
	base := command.BaseModifiedAt
	result, err := s.gateway().UpdateRaw(ctx, store.UpdateRawCommand{
		AnimeID: command.AnimeID,
		Base:    &base,
		Mutate:  store.NewEditorRawMutation(toLegacyEditorMutation(command.Patch), s.nowFunc()),
	})
	return fromLegacyPatchResult(result), err
}

// patchedTitle returns the patched title when present, otherwise the current title.
func patchedTitle(current string, patch *string) string {
	if patch != nil {
		return *patch
	}
	return current
}

// patchedProgress returns the patched progress when present, otherwise the current progress.
func patchedProgress(current float64, patch *float64) float64 {
	if patch != nil {
		return *patch
	}
	return current
}

// patchedStatus returns the patched status when present, otherwise the current status.
func patchedStatus(current, patch *int) *int {
	if patch != nil {
		return patch
	}
	return current
}

// Deactivate marks an anime inactive through the shared lifecycle mutation.
func (s *EditorService) Deactivate(ctx context.Context, animeID string, baseModifiedAt int64) (PatchResult, error) {
	base := baseModifiedAt
	result, err := s.gateway().UpdateRaw(ctx, store.UpdateRawCommand{
		AnimeID: animeID,
		Base:    &base,
		Mutate:  store.NewDeactivateRawMutation(s.nowFunc()),
	})
	return fromLegacyPatchResult(result), err
}

// toLegacyEditorMutation converts an editor patch into a legacy mutation.
func toLegacyEditorMutation(patch EditorPatch) store.EditorMutation {
	return store.EditorMutation{
		Name:          patch.Name,
		Status:        patch.Status,
		Progress:      patch.Progress,
		TotalEpisodes: toLegacyNullableIntMutation(patch.TotalEpisodes),
		Kind:          toLegacyNullableIntMutation(patch.Kind),
		Page:          toLegacyNullableStringMutation(patch.Page),
		Folder:        toLegacyNullableStringMutation(patch.Folder),
		Origin:        toLegacyNullableStringMutation(patch.Origin),
		Duration:      toLegacyNullableIntMutation(patch.Duration),
		PremieredAt:   store.NullableTimeMutation{Present: patch.PremieredAt.Present, Clear: patch.PremieredAt.Clear, UnixMilli: patch.PremieredAt.UnixMilli},
		Genres:        patch.Genres,
		Placements:    patch.Placements,
		Active:        patch.Active,
		Cover:         store.CoverMutation{Present: patch.Cover.Present, Clear: patch.Cover.Clear, Type: patch.Cover.Type, Path: patch.Cover.Path, Raw: patch.Cover.Raw},
		Studios:       store.StudiosMutation{Present: patch.Studios.Present, Clear: patch.Studios.Clear, Values: patch.Studios.Values},
	}
}

// toLegacyNullableStringMutation converts an editor nullable string patch into a legacy mutation.
func toLegacyNullableStringMutation(patch EditorNullableStringPatch) store.NullableStringMutation {
	return store.NullableStringMutation{Present: patch.Present, Clear: patch.Clear, Value: patch.Value}
}

// toLegacyNullableIntMutation converts an editor nullable integer patch into a legacy mutation.
func toLegacyNullableIntMutation(patch EditorNullableIntPatch) store.NullableIntMutation {
	return store.NullableIntMutation{Present: patch.Present, Clear: patch.Clear, Value: patch.Value}
}

// EditorService.gateway creates a store gateway with the service's dependencies and callbacks.
func (s *EditorService) gateway() *store.Gateway {
	return store.NewGateway(newStoreGatewayConfig(s.store, s.writeBases, s.deps, s.nowFuncForToken(), s.publishCommitted))
}

// EditorService.publishCommitted publishes a committed anime change through the configured publisher.
func (s *EditorService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

// EditorService.nowFunc returns the current time from the service clock.
func (s *EditorService) nowFunc() time.Time {
	return s.nowFuncForToken()()
}

// EditorService.nowFuncForToken returns the configured clock or the system clock.
func (s *EditorService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}
