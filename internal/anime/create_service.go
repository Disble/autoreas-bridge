package anime

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"autoreas-bridge/internal/anime/store"
	"autoreas-bridge/internal/api/contracts"
)

// CreateMetadata contains source facts that may enrich a canonical create.
// LatestEpisode is observational availability and must never be promoted to
// AnnouncedTotal.
type CreateMetadata struct {
	AnnouncedTotal  *int
	DurationMinutes *int
	CoverURL        string
	LatestEpisode   *int
}

type canonicalCreateWriter interface {
	CreateCanonicalAnime(context.Context, contracts.AnimeCreate, CreateMetadata) (PatchResult, error)
	BuildCreateOperation(contracts.AnimeCreate, CreateMetadata) (store.BatchOperation, string, error)
	ApplyBatch(context.Context, []store.BatchOperation) (PatchResult, error)
}

// neighborRecordLister lists the current read records used to reflow existing
// neighbor placements during a create batch.
type neighborRecordLister interface {
	ListReadRecords(ctx context.Context) ([]ReadRecord, error)
}

// CreateService validates a create before handing canonical state to the
// persistence service. Download capability is intentionally outside this path.
type CreateService struct {
	writer canonicalCreateWriter
	query  neighborRecordLister
}

// SetQuery configures the read-model service used to resolve existing
// neighbor placements for CreateBatch. Optional: CreateBatch calls without
// neighbors do not require it.
func (s *CreateService) SetQuery(query neighborRecordLister) {
	s.query = query
}

// NewCreateService builds a create service over the provided writer.
func NewCreateService(writer canonicalCreateWriter) *CreateService {
	return &CreateService{writer: writer}
}

// CreateAnime validates one anime create request before persistence.
func (s *CreateService) CreateAnime(ctx context.Context, create contracts.AnimeCreate) (PatchResult, error) {
	if s == nil || s.writer == nil {
		return PatchResult{}, fmt.Errorf("canonical anime create writer is required")
	}
	if err := validateCreateRequest(create); err != nil {
		return PatchResult{}, err
	}
	if err := s.ensureNamesAreFree(ctx, []contracts.AnimeCreate{create}); err != nil {
		return PatchResult{}, err
	}

	return s.writer.CreateCanonicalAnime(ctx, create, CreateMetadata{})
}

// normalizeAnimeName folds a name to the identity the catalogue treats as one
// anime: case and surrounding whitespace never tell two animes apart.
//
// This mirrors the unique index in internal/sync, but is not byte-identical to
// it: SQLite's lower() folds ASCII only, while this folds Unicode too. The
// difference makes this check the stricter of the two, which is the safe
// direction -- the index stays the guarantee and can never be bypassed, while
// this exists to produce a readable refusal instead of a raw constraint error.
func normalizeAnimeName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// ensureNamesAreFree refuses a create whose name another anime already holds,
// naming that anime so the user can restore or rename it instead.
//
// A soft-deleted record still holds its name: deletion is a lifecycle state the
// Editor can undo, so re-creating the anime would produce exactly the duplicate
// this guard exists to prevent.
//
// With no catalogue wired the check is skipped rather than failing closed: both
// production wirings supply one, and the unique index remains the guarantee
// either way.
func (s *CreateService) ensureNamesAreFree(ctx context.Context, creates []contracts.AnimeCreate) error {
	if s.query == nil {
		return nil
	}
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return err
	}

	holders := make(map[string]string, len(records))
	for _, record := range records {
		holders[normalizeAnimeName(record.Value.Title)] = record.Value.ID
	}
	for _, create := range creates {
		key := normalizeAnimeName(create.Nombre)
		holder, taken := holders[key]
		if !taken {
			holders[key] = ""
			continue
		}
		if holder == "" {
			return fmt.Errorf("this batch would create the anime %q twice", strings.TrimSpace(create.Nombre))
		}
		return fmt.Errorf(
			"the anime %q already exists as %q; rename this one, or restore the existing record from the Editor",
			strings.TrimSpace(create.Nombre), holder)
	}
	return nil
}

// validateCreateRequest checks that an anime creation payload has a non-empty trimmed title
// and a valid optional id.
func validateCreateRequest(create contracts.AnimeCreate) error {
	if create.ID != "" && strings.TrimSpace(create.ID) != create.ID {
		return fmt.Errorf("invalid anime create id")
	}
	if strings.TrimSpace(create.Nombre) == "" {
		return fmt.Errorf("invalid anime create title")
	}
	if strings.TrimSpace(create.Pagina) == "" {
		return fmt.Errorf("invalid anime create source page")
	}
	if len(create.Dias) == 0 {
		return fmt.Errorf("invalid anime create schedule entry: at least one placement is required")
	}
	for _, placement := range create.Dias {
		if strings.TrimSpace(placement.Day) == "" || placement.Order <= 0 {
			return fmt.Errorf("invalid anime create schedule entry")
		}
	}
	return nil
}

// CreateBatch persists one or more new animes plus any reflowed existing
// neighbor placements atomically through Gateway.ApplyBatch. A stale neighbor
// base (its authoritative modified_at no longer matches BaseModifiedAt)
// rejects the whole batch before anything is staged.
func (s *CreateService) CreateBatch(
	ctx context.Context,
	creates []contracts.AnimeCreate,
	neighbors []ApplyAnimeScheduleDraftEntry,
) (contracts.AnimeCreateResult, error) {
	if s == nil || s.writer == nil {
		return contracts.AnimeCreateResult{}, fmt.Errorf("canonical anime create writer is required")
	}
	if len(creates) == 0 {
		return contracts.AnimeCreateResult{}, fmt.Errorf("at least one anime create is required")
	}

	if err := s.ensureNamesAreFree(ctx, creates); err != nil {
		return contracts.AnimeCreateResult{}, err
	}

	operations := make([]store.BatchOperation, 0, len(creates)+len(neighbors))
	ids := make([]string, 0, len(creates))
	for _, create := range creates {
		if err := validateCreateRequest(create); err != nil {
			return contracts.AnimeCreateResult{}, err
		}
		operation, id, err := s.writer.BuildCreateOperation(create, CreateMetadata{})
		if err != nil {
			return contracts.AnimeCreateResult{}, err
		}
		operations = append(operations, operation)
		ids = append(ids, id)
	}

	neighborOps, err := s.buildNeighborOperations(ctx, neighbors)
	if err != nil {
		return contracts.AnimeCreateResult{}, err
	}
	operations = append(operations, neighborOps...)
	sort.Slice(operations, func(i, j int) bool { return operations[i].AnimeID < operations[j].AnimeID })

	result, err := s.writer.ApplyBatch(ctx, operations)
	if err != nil {
		return contracts.AnimeCreateResult{}, err
	}
	return contracts.AnimeCreateResult{
		Outcome: result.Outcome, AnimeIDs: ids,
		ModifiedAt: result.ModifiedAt, ConflictID: result.ConflictID,
	}, nil
}

// buildNeighborOperations builds reflow operations for existing neighbors,
// rejecting the whole batch when any neighbor's authoritative state has
// changed since the board was seeded.
func (s *CreateService) buildNeighborOperations(ctx context.Context, neighbors []ApplyAnimeScheduleDraftEntry) ([]store.BatchOperation, error) {
	if len(neighbors) == 0 {
		return nil, nil
	}
	if s.query == nil {
		return nil, fmt.Errorf("query service is required to reflow existing neighbor placements")
	}
	records, err := s.query.ListReadRecords(ctx)
	if err != nil {
		return nil, err
	}
	recordsByID := make(map[string]ReadRecord, len(records))
	for _, record := range records {
		recordsByID[record.Value.ID] = record
	}

	operations := make([]store.BatchOperation, 0, len(neighbors))
	for _, neighbor := range neighbors {
		record, ok := recordsByID[neighbor.AnimeID]
		if !ok {
			return nil, fmt.Errorf("neighbor anime %q not found", neighbor.AnimeID)
		}
		if record.Snapshot.ModifiedAt != neighbor.BaseModifiedAt {
			return nil, fmt.Errorf("neighbor anime %q base is stale", neighbor.AnimeID)
		}
		operation, changed, err := buildScheduleOperation(neighbor.AnimeID, record, neighbor.Placements)
		if err != nil {
			return nil, err
		}
		// An unchanged neighbor yields a zero BatchOperation, which staging
		// rejects for its empty anime id. Drop it: the board reindexes column
		// orders from scratch, so a reflow can legitimately land back on the
		// orders already stored.
		if !changed {
			continue
		}
		operations = append(operations, operation)
	}
	return operations, nil
}

var _ Creator = (*CreateService)(nil)
