package anime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

type EditorNullableStringPatch struct {
	Present bool
	Clear   bool
	Value   string
}

type EditorNullableIntPatch struct {
	Present bool
	Clear   bool
	Value   int
}

type EditorNullableTimePatch struct {
	Present   bool
	Clear     bool
	UnixMilli int64
}

type EditorStudiosPatch struct {
	Present bool
	Clear   bool
	Values  []string
}

type EditorCoverPatch struct {
	Present bool
	Clear   bool
	Type    string
	Path    string
	Raw     map[string]json.RawMessage
}

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
	Placements      []contracts.MobileAnimeDay
	Active          *bool
	Cover           EditorCoverPatch
	Studios         EditorStudiosPatch
	ForbiddenFields []string
}

type SaveAnimeEditorCommand struct {
	AnimeID        string
	BaseModifiedAt int64
	Patch          EditorPatch
}

type EditorService struct {
	store      snapshotLookup
	writer     AnimeWriter
	writeBases WriteBaseStore
	now        func() time.Time
	deps       WriteServiceDeps
}

func NewEditorService(store snapshotLookup, writer AnimeWriter) *EditorService {
	service := &EditorService{store: store, writer: writer, now: time.Now}
	if provider, ok := store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

func (s *EditorService) SetNow(now func() time.Time) { s.now = now }

func (s *EditorService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

func (s *EditorService) Save(ctx context.Context, command SaveAnimeEditorCommand) (AnimePatchResult, error) {
	if strings.TrimSpace(command.AnimeID) == "" {
		return AnimePatchResult{}, errors.New("editor save: anime id cannot be blank")
	}
	if err := validateEditorPatch(command.Patch); err != nil {
		return AnimePatchResult{}, err
	}
	record, err := s.store.GetSnapshot(ctx, command.AnimeID)
	if err != nil {
		return AnimePatchResult{}, err
	}
	_, current, _, err := legacy.DecodeForUpdate(record.CanonicalJSON)
	if err != nil {
		return AnimePatchResult{}, err
	}
	if err := validateEditorPatchAgainstCurrent(command.Patch, current); err != nil {
		return AnimePatchResult{}, err
	}
	base := command.BaseModifiedAt
	result, err := s.gateway().UpdateRaw(ctx, legacy.UpdateRawCommand{
		AnimeID: command.AnimeID,
		Base:    &base,
		Mutate:  legacy.NewEditorRawMutation(toLegacyEditorMutation(command.Patch), s.nowFunc()),
	})
	return fromLegacyPatchResult(result), err
}

func validateEditorPatch(patch EditorPatch) error {
	if len(patch.ForbiddenFields) > 0 {
		return fmt.Errorf("editor save: forbidden fields: %s", strings.Join(patch.ForbiddenFields, ", "))
	}
	if patch.Name != nil && strings.TrimSpace(*patch.Name) == "" {
		return errors.New("editor save: title cannot be blank")
	}
	if patch.Status != nil && (*patch.Status < 0 || *patch.Status > 3) {
		return fmt.Errorf("editor save: unsupported status %d", *patch.Status)
	}
	if patch.Progress != nil && (math.IsNaN(*patch.Progress) || math.IsInf(*patch.Progress, 0) || *patch.Progress < 0) {
		return errors.New("editor save: progress cannot be negative")
	}
	if err := validateNullableIntPatch("total episodes", patch.TotalEpisodes, true, 0, math.MaxInt); err != nil {
		return err
	}
	if err := validateNullableIntPatch("type", patch.Kind, true, 0, 3); err != nil {
		return err
	}
	if err := validateNullableIntPatch("duration", patch.Duration, false, 1, math.MaxInt); err != nil {
		return err
	}
	if err := validateNullableTimePatch(patch.PremieredAt); err != nil {
		return err
	}
	if err := validateNullableStringPatch("page", patch.Page); err != nil {
		return err
	}
	if err := validateNullableStringPatch("folder", patch.Folder); err != nil {
		return err
	}
	if err := validateNullableStringPatch("origin", patch.Origin); err != nil {
		return err
	}
	if err := validateEditorURLPatch(patch.Page); err != nil {
		return err
	}
	if err := validateEditorFolderPatch(patch.Folder); err != nil {
		return err
	}
	if err := validateStudiosPatch(patch.Studios); err != nil {
		return err
	}
	if err := validateCoverPatch(patch.Cover); err != nil {
		return err
	}
	return nil
}

func validateEditorPatchAgainstCurrent(patch EditorPatch, current domain.Anime) error {
	title := current.Title
	if patch.Name != nil {
		title = *patch.Name
	}
	if strings.TrimSpace(title) == "" {
		return errors.New("editor save: title cannot be blank")
	}
	progress := current.Progress
	if patch.Progress != nil {
		progress = *patch.Progress
	}
	if math.IsNaN(progress) || math.IsInf(progress, 0) || progress < 0 {
		return errors.New("editor save: progress must be a finite nonnegative number")
	}
	status := current.Status
	if patch.Status != nil {
		status = patch.Status
	}
	if status != nil && (*status < 0 || *status > 3) {
		return errors.New("editor save: current status is unsupported")
	}
	if err := validateCurrentOptionalNumber("total episodes", current.TotalEpisodes, true); err != nil && !patch.TotalEpisodes.Present {
		return err
	}
	if err := validateCurrentOptionalNumber("duration", current.DurationMinutes, false); err != nil && !patch.Duration.Present {
		return err
	}
	if current.ContentType != nil && (*current.ContentType < 0 || *current.ContentType > 3) && !patch.Kind.Present {
		return errors.New("editor save: current type is unsupported")
	}
	if patch.Active != nil && *patch.Active && current.Active != domain.TriStateTrue {
		return errors.New("editor save: inactive anime can only be restored through lifecycle restore")
	}
	if err := validateEditorPlacements(patch.Placements); err != nil {
		return err
	}
	return nil
}

func validateCurrentOptionalNumber(name string, value *float64, allowZero bool) error {
	if value == nil {
		return nil
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || math.Trunc(*value) != *value || (!allowZero && *value == 0) {
		return fmt.Errorf("editor save: current %s is invalid", name)
	}
	return nil
}

func validateEditorPlacements(placements []contracts.MobileAnimeDay) error {
	seen := map[string]struct{}{}
	for _, placement := range placements {
		if _, allowed := allowedScheduleDestinations[placement.Dia]; !allowed || placement.Orden <= 0 {
			return fmt.Errorf("editor save: invalid schedule placement %q at %d", placement.Dia, placement.Orden)
		}
		key := fmt.Sprintf("%s#%d", placement.Dia, placement.Orden)
		if _, duplicate := seen[key]; duplicate {
			return fmt.Errorf("editor save: duplicate schedule placement %s", key)
		}
		seen[key] = struct{}{}
	}
	return nil
}

func validateNullableStringPatch(name string, patch EditorNullableStringPatch) error {
	if !patch.Present && (patch.Clear || patch.Value != "") {
		return fmt.Errorf("editor save: malformed omitted %s patch", name)
	}
	if patch.Clear && patch.Value != "" {
		return fmt.Errorf("editor save: malformed cleared %s patch", name)
	}
	return nil
}

func validateNullableIntPatch(name string, patch EditorNullableIntPatch, allowZero bool, minimum, maximum int) error {
	if !patch.Present && (patch.Clear || patch.Value != 0) {
		return fmt.Errorf("editor save: malformed omitted %s patch", name)
	}
	if patch.Clear && patch.Value != 0 {
		return fmt.Errorf("editor save: malformed cleared %s patch", name)
	}
	if !patch.Present || patch.Clear {
		return nil
	}
	if patch.Value < minimum || patch.Value > maximum || (!allowZero && patch.Value == 0) {
		return fmt.Errorf("editor save: invalid %s %d", name, patch.Value)
	}
	return nil
}

func validateNullableTimePatch(patch EditorNullableTimePatch) error {
	if !patch.Present && (patch.Clear || patch.UnixMilli != 0) {
		return errors.New("editor save: malformed omitted premiere date patch")
	}
	if patch.Clear && patch.UnixMilli != 0 {
		return errors.New("editor save: malformed cleared premiere date patch")
	}
	if patch.Present && !patch.Clear && (patch.UnixMilli < 0 || patch.UnixMilli > 253402300799999) {
		return errors.New("editor save: invalid premiere date")
	}
	return nil
}

func validateEditorURLPatch(patch EditorNullableStringPatch) error {
	if !patch.Present || patch.Clear || strings.TrimSpace(patch.Value) == "" {
		return nil
	}
	if err := ValidatePageURL(patch.Value); err != nil {
		return fmt.Errorf("editor save: %w", err)
	}
	return nil
}

func validateEditorFolderPatch(patch EditorNullableStringPatch) error {
	if !patch.Present || patch.Clear || strings.TrimSpace(patch.Value) == "" {
		return nil
	}
	if err := ValidateLocalFolder(patch.Value); err != nil {
		return fmt.Errorf("editor save: %w", err)
	}
	return nil
}

func validateStudiosPatch(patch EditorStudiosPatch) error {
	if !patch.Present && (patch.Clear || patch.Values != nil) {
		return errors.New("editor save: malformed omitted studios patch")
	}
	if patch.Clear && len(patch.Values) > 0 {
		return errors.New("editor save: malformed cleared studios patch")
	}
	return nil
}

func validateCoverPatch(patch EditorCoverPatch) error {
	if !patch.Present && (patch.Clear || patch.Type != "" || patch.Path != "" || patch.Raw != nil) {
		return errors.New("editor save: malformed omitted cover patch")
	}
	if patch.Clear && (patch.Type != "" || patch.Path != "" || patch.Raw != nil) {
		return errors.New("editor save: malformed cleared cover patch")
	}
	if patch.Present && !patch.Clear && strings.TrimSpace(patch.Type) == "" {
		return errors.New("editor save: cover type cannot be blank")
	}
	for key, value := range patch.Raw {
		if key == "type" || key == "path" || !json.Valid(value) {
			return fmt.Errorf("editor save: invalid cover raw field %q", key)
		}
	}
	return nil
}

func (s *EditorService) Deactivate(ctx context.Context, animeID string, baseModifiedAt int64) (AnimePatchResult, error) {
	base := baseModifiedAt
	result, err := s.gateway().UpdateRaw(ctx, legacy.UpdateRawCommand{
		AnimeID: animeID,
		Base:    &base,
		Mutate:  legacy.NewDeactivateRawMutation(s.nowFunc()),
	})
	return fromLegacyPatchResult(result), err
}

func toLegacyEditorMutation(patch EditorPatch) legacy.EditorMutation {
	return legacy.EditorMutation{
		Name:          patch.Name,
		Status:        patch.Status,
		Progress:      patch.Progress,
		TotalEpisodes: toLegacyNullableIntMutation(patch.TotalEpisodes),
		Kind:          toLegacyNullableIntMutation(patch.Kind),
		Page:          toLegacyNullableStringMutation(patch.Page),
		Folder:        toLegacyNullableStringMutation(patch.Folder),
		Origin:        toLegacyNullableStringMutation(patch.Origin),
		Duration:      toLegacyNullableIntMutation(patch.Duration),
		PremieredAt:   legacy.NullableTimeMutation{Present: patch.PremieredAt.Present, Clear: patch.PremieredAt.Clear, UnixMilli: patch.PremieredAt.UnixMilli},
		Genres:        patch.Genres,
		Placements:    append([]contracts.MobileAnimeDay{}, patch.Placements...),
		Active:        patch.Active,
		Cover:         legacy.CoverMutation{Present: patch.Cover.Present, Clear: patch.Cover.Clear, Type: patch.Cover.Type, Path: patch.Cover.Path, Raw: patch.Cover.Raw},
		Studios:       legacy.StudiosMutation{Present: patch.Studios.Present, Clear: patch.Studios.Clear, Values: patch.Studios.Values},
	}
}

func toLegacyNullableStringMutation(patch EditorNullableStringPatch) legacy.NullableStringMutation {
	return legacy.NullableStringMutation{Present: patch.Present, Clear: patch.Clear, Value: patch.Value}
}

func toLegacyNullableIntMutation(patch EditorNullableIntPatch) legacy.NullableIntMutation {
	return legacy.NullableIntMutation{Present: patch.Present, Clear: patch.Clear, Value: patch.Value}
}

func (s *EditorService) gateway() *legacy.Gateway {
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

func (s *EditorService) append(ctx context.Context, _ string, payload []byte) error {
	if s.writer == nil {
		return legacy.NewDefiniteAppendError(fmt.Errorf("anime writer is required"))
	}
	if writer, ok := s.writer.(appendOnlyAnimeWriter); ok {
		return writer.RequestAppend(ctx, animeIDFromPayload(payload), payload)
	}
	return s.writer.RequestWrite(ctx, animeIDFromPayload(payload), payload)
}

func (s *EditorService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

func (s *EditorService) nowFunc() time.Time {
	return s.nowFuncForToken()()
}

func (s *EditorService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}
