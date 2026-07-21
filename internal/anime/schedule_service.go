package anime

import (
	"context"
	"fmt"
	"sort"
	"time"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/events"
)

// ApplyAnimeScheduleDraftEntry captures one moved card in a schedule draft.
type ApplyAnimeScheduleDraftEntry struct {
	AnimeID        string
	BaseModifiedAt int64
	Placements     []contracts.MobileAnimeDay
}

// ApplyAnimeScheduleDraftCommand carries the editor's partial board mutation request.
type ApplyAnimeScheduleDraftCommand struct {
	BoardModifiedAt int64
	Entries         []ApplyAnimeScheduleDraftEntry
}

// ScheduleService applies schedule-board mutations through the anime write seams.
type ScheduleService struct {
	query      *QueryService
	store      snapshotLookup
	writer     Writer
	writeBases WriteBaseStore
	now        func() time.Time
	deps       WriteServiceDeps
}

// NewScheduleService builds a schedule mutation service over query and writer seams.
func NewScheduleService(query *QueryService, writer Writer) *ScheduleService {
	service := &ScheduleService{query: query, store: query.store, writer: writer, now: time.Now}
	if provider, ok := query.store.(writeBaseStoreProvider); ok {
		service.writeBases = provider.WriteBaseStore()
	}
	return service
}

// SetNow overrides the clock used by ScheduleService.
func (s *ScheduleService) SetNow(now func() time.Time) { s.now = now }

// SetDeps overrides optional write-side dependencies used by ScheduleService.
func (s *ScheduleService) SetDeps(deps WriteServiceDeps) {
	if deps.WriteBases != nil {
		s.writeBases = deps.WriteBases
	}
	s.deps = deps
}

// Apply persists an editor schedule draft atomically.
//
// The UI sends only cards the user moved. This service expands that partial draft
// into the affected queues, then persists the resulting top-to-bottom order as
// contiguous one-based legacy `orden` values. Moving a card to position 1 therefore
// shifts every card below it, while unrelated legacy destinations remain unchanged.
func (s *ScheduleService) Apply(ctx context.Context, command ApplyAnimeScheduleDraftCommand) (PatchResult, error) {
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return PatchResult{}, err
	}
	if err := validateScheduleDraft(records, command); err != nil {
		return PatchResult{}, err
	}
	boardModifiedAt := currentBoardModifiedAt(records)
	if boardModifiedAt != command.BoardModifiedAt {
		return s.recordBoardConflict(ctx, records, command)
	}
	recordsByID := activeScheduleRecordsByID(records)
	if conflictEntry, ok := staleScheduleEntry(recordsByID, command.Entries); ok {
		return s.conflict(ctx, recordsByID[conflictEntry.AnimeID].Snapshot, conflictEntry)
	}
	if len(command.Entries) == 0 {
		return noOpScheduleResult(boardModifiedAt), nil
	}
	operations, err := buildScheduleOperations(recordsByID, normalizedSchedulePlacements(records, command))
	if err != nil {
		return PatchResult{}, err
	}
	if len(operations) == 0 {
		return noOpScheduleResult(boardModifiedAt), nil
	}
	sort.Slice(operations, func(i, j int) bool { return operations[i].AnimeID < operations[j].AnimeID })
	result, err := s.gateway().ApplyBatch(ctx, operations)
	return fromLegacyPatchResult(result), err
}

// noOpScheduleResult creates a result for an unchanged schedule board.
func noOpScheduleResult(boardModifiedAt int64) PatchResult {
	return PatchResult{Outcome: PatchOutcomeNoOp, ModifiedAt: boardModifiedAt}
}

// staleScheduleEntry finds the first draft entry whose base is outdated.
func staleScheduleEntry(recordsByID map[string]ReadRecord, entries []ApplyAnimeScheduleDraftEntry) (ApplyAnimeScheduleDraftEntry, bool) {
	for _, entry := range entries {
		if recordsByID[entry.AnimeID].Snapshot.ModifiedAt != entry.BaseModifiedAt {
			return entry, true
		}
	}
	return ApplyAnimeScheduleDraftEntry{}, false
}

// activeScheduleRecordsByID indexes active schedule records by anime ID.
func activeScheduleRecordsByID(records []ReadRecord) map[string]ReadRecord {
	result := make(map[string]ReadRecord, len(records))
	for _, record := range records {
		item := mobileAnimeFromDomain(record.Value, record.Snapshot.ModifiedAt)
		if item.Activo != 1 {
			continue
		}
		result[item.ID] = record
	}
	return result
}

// scheduleEntryIDs returns the anime IDs represented in a schedule draft.
func scheduleEntryIDs(entries []ApplyAnimeScheduleDraftEntry) map[string]struct{} {
	ids := map[string]struct{}{}
	for _, entry := range entries {
		ids[entry.AnimeID] = struct{}{}
	}
	return ids
}

// submittedScheduleDestinations returns destinations present in a schedule draft.
func submittedScheduleDestinations(entries []ApplyAnimeScheduleDraftEntry) map[string]struct{} {
	destinations := map[string]struct{}{}
	for _, entry := range entries {
		for _, placement := range entry.Placements {
			destinations[placement.Dia] = struct{}{}
		}
	}
	return destinations
}

// isChangedScheduleAnime reports whether an anime ID is in the changed set.
func isChangedScheduleAnime(changed map[string]struct{}, animeID string) bool {
	_, exists := changed[animeID]
	return exists
}

// currentBoardModifiedAt returns the latest modification time on the active board.
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

// conflict applies a schedule update against the current snapshot.
func (s *ScheduleService) conflict(ctx context.Context, current SnapshotRecord, entry ApplyAnimeScheduleDraftEntry) (PatchResult, error) {
	result, err := s.gateway().UpdateRaw(ctx, store.UpdateRawCommand{
		AnimeID: current.AnimeID,
		Base:    &entry.BaseModifiedAt,
		Mutate:  store.NewSchedulePlacementsMutation(entry.Placements),
	})
	if err != nil {
		return PatchResult{}, err
	}
	return fromLegacyPatchResult(result), nil
}

// recordBoardConflict records a conflict for a stale schedule board.
func (s *ScheduleService) recordBoardConflict(ctx context.Context, records []ReadRecord, command ApplyAnimeScheduleDraftCommand) (PatchResult, error) {
	board := currentBoardModifiedAt(records)
	if len(command.Entries) == 0 || s.deps.Conflicts == nil {
		return PatchResult{Outcome: PatchOutcomeConflict, ModifiedAt: board}, nil
	}
	entry := command.Entries[0]
	record, err := s.query.GetReadRecord(ctx, entry.AnimeID)
	if err != nil {
		return PatchResult{Outcome: PatchOutcomeConflict, ModifiedAt: board}, nil
	}
	raw, _, _, err := store.DecodeForUpdate(record.Snapshot.CanonicalJSON)
	if err != nil {
		return PatchResult{Outcome: PatchOutcomeConflict, ModifiedAt: board}, nil
	}
	days := make([]store.AnimeDay, 0, len(entry.Placements))
	for _, placement := range entry.Placements {
		days = append(days, store.AnimeDay{Dia: placement.Dia, Orden: float64(placement.Orden)})
	}
	raw.SetDays(days)
	desired, err := raw.MarshalJSON()
	if err != nil {
		return PatchResult{Outcome: PatchOutcomeConflict, ModifiedAt: board}, nil
	}
	conflictID := fmt.Sprintf("%s-%d", entry.AnimeID, s.nowFuncForToken()().UnixMilli())
	if err := s.deps.Conflicts.InsertConflict(ctx, contracts.ConflictRecord{
		ConflictID:         conflictID,
		AnimeID:            entry.AnimeID,
		LocalSnapshotJSON:  append([]byte(nil), record.Snapshot.CanonicalJSON...),
		RemoteSnapshotJSON: append([]byte(nil), desired...),
		DetectedAtMs:       s.nowFuncForToken()().UnixMilli(),
	}); err != nil {
		return PatchResult{}, err
	}
	return PatchResult{Outcome: PatchOutcomeConflict, ModifiedAt: board, ConflictID: conflictID}, nil
}

// gateway builds the store gateway used by schedule operations.
func (s *ScheduleService) gateway() *store.Gateway {
	return store.NewGateway(newStoreGatewayConfig(s.store, s.writeBases, s.deps, s.nowFuncForToken(), s.publishCommitted))
}

// publishCommitted publishes a committed schedule change.
func (s *ScheduleService) publishCommitted(eventID, id string, payload []byte) {
	if s.deps.Publisher != nil {
		s.deps.Publisher.Publish(events.AnimeChangedEvent{EventID: eventID, AnimeID: id, Payload: append([]byte(nil), payload...)})
		return
	}
	if publisher, ok := s.writer.(committedAnimePublisher); ok {
		publisher.PublishCommitted(eventID, id, payload)
	}
}

// nowFuncForToken returns the configured schedule clock function.
func (s *ScheduleService) nowFuncForToken() func() time.Time {
	if s.now == nil {
		return time.Now
	}
	return s.now
}
