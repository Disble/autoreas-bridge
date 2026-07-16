package anime

import (
	"bytes"
	"context"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/legacy"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

type ApplyAnimeScheduleDraftEntry struct {
	AnimeID        string
	BaseModifiedAt int64
	Placements     []contracts.MobileAnimeDay
}

type ApplyAnimeScheduleDraftCommand struct {
	BoardModifiedAt int64
	Entries         []ApplyAnimeScheduleDraftEntry
}

type ScheduleService struct {
	query      *QueryService
	store      snapshotLookup
	writer     AnimeWriter
	writeBases WriteBaseStore
	now        func() time.Time
	deps       WriteServiceDeps
}

type batchReplaceWriter interface {
	ReplaceFile(context.Context, string, [][]byte) error
}

type replacementEchoProvider interface {
	ReplacementEchoRegistry() legacy.ReplacementEchoRegistry
}

func NewScheduleService(query *QueryService, writer AnimeWriter) *ScheduleService {
	service := &ScheduleService{query: query, store: query.store, writer: writer, now: time.Now}
	if provider, ok := query.store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

func (s *ScheduleService) SetNow(now func() time.Time) { s.now = now }

func (s *ScheduleService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

func (s *ScheduleService) Apply(ctx context.Context, command ApplyAnimeScheduleDraftCommand) (AnimePatchResult, error) {
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return AnimePatchResult{}, err
	}
	if err := validateScheduleDraft(records, command); err != nil {
		return AnimePatchResult{}, err
	}
	if currentBoardModifiedAt(records) != command.BoardModifiedAt {
		return s.recordBoardConflict(ctx, records, command)
	}
	operations := make([]legacy.BatchOperation, 0, len(command.Entries))
	for _, entry := range command.Entries {
		record, err := s.query.GetReadRecord(ctx, entry.AnimeID)
		if err != nil {
			return AnimePatchResult{}, err
		}
		if record.Snapshot.ModifiedAt != entry.BaseModifiedAt {
			return s.conflict(ctx, record.Snapshot, entry)
		}
		raw, _, _, err := legacy.DecodeForUpdate(record.Snapshot.CanonicalJSON)
		if err != nil {
			return AnimePatchResult{}, err
		}
		days := make([]legacy.LegacyAnimeDay, 0, len(entry.Placements))
		for _, placement := range entry.Placements {
			days = append(days, legacy.LegacyAnimeDay{Dia: placement.Dia, Orden: float64(placement.Orden)})
		}
		raw.SetDays(days)
		desired, err := raw.MarshalJSON()
		if err != nil {
			return AnimePatchResult{}, err
		}
		if bytes.Equal(desired, record.Snapshot.CanonicalJSON) {
			continue
		}
		operations = append(operations, legacy.BatchOperation{AnimeID: entry.AnimeID, Base: toLegacySnapshot(record.Snapshot), Desired: desired})
	}
	if len(operations) == 0 {
		return AnimePatchResult{Outcome: AnimePatchOutcomeNoOp, ModifiedAt: currentBoardModifiedAt(records)}, nil
	}
	sort.Slice(operations, func(i, j int) bool { return operations[i].AnimeID < operations[j].AnimeID })
	result, err := s.gateway().ApplyBatch(ctx, operations)
	return fromLegacyPatchResult(result), err
}

var allowedScheduleDestinations = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
	"Sin ver": {}, "Ver hoy": {}, "Visto": {},
}

func validateScheduleDraft(records []ReadRecord, command ApplyAnimeScheduleDraftCommand) error {
	seenAnimeIDs := map[string]struct{}{}
	byDestination := map[string][]int{}
	activeIDs := map[string]struct{}{}
	activePlacements := map[string][]contracts.MobileAnimeDay{}
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Activo == 1 {
			activeIDs[item.ID] = struct{}{}
			activePlacements[item.ID] = item.Dias
		}
	}
	for _, entry := range command.Entries {
		if _, ok := activeIDs[entry.AnimeID]; !ok {
			return fmt.Errorf("schedule draft anime %s is not active", entry.AnimeID)
		}
		if _, ok := seenAnimeIDs[entry.AnimeID]; ok {
			return fmt.Errorf("duplicate anime entry %s", entry.AnimeID)
		}
		seenAnimeIDs[entry.AnimeID] = struct{}{}
		seen := map[string]struct{}{}
		for _, placement := range entry.Placements {
			if _, ok := allowedScheduleDestinations[placement.Dia]; !ok {
				return fmt.Errorf("invalid schedule destination %s", placement.Dia)
			}
			if placement.Orden <= 0 {
				return fmt.Errorf("invalid schedule order %d for anime %s", placement.Orden, entry.AnimeID)
			}
			key := fmt.Sprintf("%s#%d", placement.Dia, placement.Orden)
			if _, ok := seen[key]; ok {
				return fmt.Errorf("duplicate placement %s for anime %s", key, entry.AnimeID)
			}
			seen[key] = struct{}{}
			byDestination[placement.Dia] = append(byDestination[placement.Dia], placement.Orden)
		}
	}
	for animeID, placements := range activePlacements {
		if _, submitted := seenAnimeIDs[animeID]; submitted {
			continue
		}
		for _, placement := range placements {
			if _, ok := allowedScheduleDestinations[placement.Dia]; !ok {
				continue
			}
			byDestination[placement.Dia] = append(byDestination[placement.Dia], placement.Orden)
		}
	}
	for destination, positions := range byDestination {
		sort.Ints(positions)
		for index, position := range positions {
			if position != index+1 {
				return fmt.Errorf("non-contiguous positions for %s", destination)
			}
		}
	}
	return nil
}

func currentBoardModifiedAt(records []ReadRecord) int64 {
	var boardModifiedAt int64
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Activo == 1 && record.Snapshot.ModifiedAt > boardModifiedAt {
			boardModifiedAt = record.Snapshot.ModifiedAt
		}
	}
	return boardModifiedAt
}

func (s *ScheduleService) conflict(ctx context.Context, current SnapshotRecord, entry ApplyAnimeScheduleDraftEntry) (AnimePatchResult, error) {
	result, err := s.gateway().UpdateRaw(ctx, legacy.UpdateRawCommand{
		AnimeID: current.AnimeID,
		Base:    &entry.BaseModifiedAt,
		Mutate:  legacy.NewSchedulePlacementsMutation(entry.Placements),
	})
	if err != nil {
		return AnimePatchResult{}, err
	}
	return fromLegacyPatchResult(result), nil
}

func (s *ScheduleService) recordBoardConflict(ctx context.Context, records []ReadRecord, command ApplyAnimeScheduleDraftCommand) (AnimePatchResult, error) {
	board := currentBoardModifiedAt(records)
	if len(command.Entries) == 0 || s.deps.Conflicts == nil {
		return AnimePatchResult{Outcome: AnimePatchOutcomeConflict, ModifiedAt: board}, nil
	}
	entry := command.Entries[0]
	record, err := s.query.GetReadRecord(ctx, entry.AnimeID)
	if err != nil {
		return AnimePatchResult{Outcome: AnimePatchOutcomeConflict, ModifiedAt: board}, nil
	}
	raw, _, _, err := legacy.DecodeForUpdate(record.Snapshot.CanonicalJSON)
	if err != nil {
		return AnimePatchResult{Outcome: AnimePatchOutcomeConflict, ModifiedAt: board}, nil
	}
	days := make([]legacy.LegacyAnimeDay, 0, len(entry.Placements))
	for _, placement := range entry.Placements {
		days = append(days, legacy.LegacyAnimeDay{Dia: placement.Dia, Orden: float64(placement.Orden)})
	}
	raw.SetDays(days)
	desired, err := raw.MarshalJSON()
	if err != nil {
		return AnimePatchResult{Outcome: AnimePatchOutcomeConflict, ModifiedAt: board}, nil
	}
	conflictID := fmt.Sprintf("%s-%d", entry.AnimeID, s.nowFuncForToken()().UnixMilli())
	if err := s.deps.Conflicts.InsertConflict(ctx, contracts.ConflictRecord{
		ConflictID:         conflictID,
		AnimeID:            entry.AnimeID,
		LocalSnapshotJSON:  append([]byte(nil), record.Snapshot.CanonicalJSON...),
		RemoteSnapshotJSON: append([]byte(nil), desired...),
		DetectedAtMs:       s.nowFuncForToken()().UnixMilli(),
	}); err != nil {
		return AnimePatchResult{}, err
	}
	return AnimePatchResult{Outcome: AnimePatchOutcomeConflict, ModifiedAt: board, ConflictID: conflictID}, nil
}

func (s *ScheduleService) gateway() *legacy.Gateway {
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
	config := legacy.GatewayConfig{
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
	}
	if provider, ok := s.writer.(replacementEchoProvider); ok {
		config.ReplacementEcho = provider.ReplacementEchoRegistry()
	}
	if _, ok := s.writer.(batchReplaceWriter); ok {
		config.ReplaceFile = s.replaceFile
	}
	return legacy.NewGateway(config)
}

func (s *ScheduleService) replaceFile(ctx context.Context, filePath string, desired [][]byte) error {
	if writer, ok := s.writer.(batchReplaceWriter); ok {
		return writer.ReplaceFile(ctx, filePath, desired)
	}
	return nil
}

func (s *ScheduleService) append(ctx context.Context, _ string, payload []byte) error {
	if s.writer == nil {
		return legacy.NewDefiniteAppendError(fmt.Errorf("anime writer is required"))
	}
	if writer, ok := s.writer.(appendOnlyAnimeWriter); ok {
		return writer.RequestAppend(ctx, animeIDFromPayload(payload), payload)
	}
	return s.writer.RequestWrite(ctx, animeIDFromPayload(payload), payload)
}

func (s *ScheduleService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

func (s *ScheduleService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}
