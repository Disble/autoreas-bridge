package anime

import (
	"context"
	"fmt"
	"strings"

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
}

// CreateService validates and enriches a create before handing canonical state
// to the persistence service.
type CreateService struct {
	writer   canonicalCreateWriter
	metadata MetadataProvider
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
	if strings.TrimSpace(create.Section) == "" || create.Orden <= 0 {
		return fmt.Errorf("invalid anime create schedule entry")
	}
	return nil
}

var _ Creator = (*CreateService)(nil)
