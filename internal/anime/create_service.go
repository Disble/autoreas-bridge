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

// MetadataProvider looks up source metadata without exposing the source to the
// Legacy gateway.
type MetadataProvider interface {
	Lookup(context.Context, string) (CreateMetadata, error)
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

// CreateService validates and enriches a create before handing canonical state
// to the persistence service.
type CreateService struct {
	writer   canonicalCreateWriter
	metadata MetadataProvider
	query    neighborRecordLister
}

// SetQuery configures the read-model service used to resolve existing
// neighbor placements for CreateBatch. Optional: CreateBatch calls without
// neighbors do not require it.
func (s *CreateService) SetQuery(query neighborRecordLister) {
	s.query = query
}

// NewCreateService builds a create service over the provided writer and metadata seam.
func NewCreateService(writer canonicalCreateWriter, metadata MetadataProvider) *CreateService {
	return &CreateService{writer: writer, metadata: metadata}
}

// CreateAnime validates and enriches one anime create request before persistence.
func (s *CreateService) CreateAnime(ctx context.Context, create contracts.AnimeCreate) (PatchResult, error) {
	if s == nil || s.writer == nil {
		return PatchResult{}, fmt.Errorf("canonical anime create writer is required")
	}
	if err := validateCreateRequest(create); err != nil {
		return PatchResult{}, err
	}

	var metadata CreateMetadata
	if s.metadata != nil {
		var err error
		metadata, err = s.metadata.Lookup(ctx, create.Pagina)
		if err != nil {
			return PatchResult{}, fmt.Errorf("lookup anime metadata for %q: %w", create.Pagina, err)
		}
	}

	return s.writer.CreateCanonicalAnime(ctx, create, metadata)
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

	operations := make([]store.BatchOperation, 0, len(creates)+len(neighbors))
	ids := make([]string, 0, len(creates))
	for _, create := range creates {
		if err := validateCreateRequest(create); err != nil {
			return contracts.AnimeCreateResult{}, err
		}
		metadata, err := s.lookupMetadata(ctx, create.Pagina)
		if err != nil {
			return contracts.AnimeCreateResult{}, err
		}
		operation, id, err := s.writer.BuildCreateOperation(create, metadata)
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

// lookupMetadata resolves optional source metadata for one create request.
func (s *CreateService) lookupMetadata(ctx context.Context, pageURL string) (CreateMetadata, error) {
	if s.metadata == nil {
		return CreateMetadata{}, nil
	}
	metadata, err := s.metadata.Lookup(ctx, pageURL)
	if err != nil {
		return CreateMetadata{}, fmt.Errorf("lookup anime metadata for %q: %w", pageURL, err)
	}
	return metadata, nil
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
		operation, _, err := buildScheduleOperation(neighbor.AnimeID, record, neighbor.Placements)
		if err != nil {
			return nil, err
		}
		operations = append(operations, operation)
	}
	return operations, nil
}

var _ Creator = (*CreateService)(nil)
