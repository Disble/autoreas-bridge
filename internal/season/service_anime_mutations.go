package season

import (
	"bytes"
	"context"
	"encoding/json"

	"autoreas-bridge/internal/season/domain"
)

// defaultAnimeType is the canonical tipo for a TV series (0 = Anime (TV)).
const defaultAnimeType = 0

// CreateSeasonAnimes is the explicit, user-initiated creation gate: for each row
// that is currently AVAILABLE, it links an existing active anime with the same
// page (two-cour continuation) or creates a new one into "Sin ver", advancing the
// row to created. Rows that are not available (waiting) or already created are
// skipped — creation is irreversible (soft delete only), so it only ever acts on
// what the user explicitly picked. metadata is the per-row lookup of confirmed
// MyAnimeList facts a row may carry into its new anime; a row with no entry
// creates exactly the anime it creates without any metadata. No download is
// triggered here.
func (s *Service) CreateSeasonAnimes(ctx context.Context, rowIDs []string, root string, overrides map[string]string, metadata map[string]AnimeCreateMetadata) (CreateResult, error) {
	if s.gateway == nil {
		return CreateResult{}, ErrAvailabilityDepsUnavailable
	}
	var res CreateResult
	for _, rowID := range rowIDs {
		sa, ok, err := s.loadCreatableSeasonAnime(ctx, rowID)
		if err != nil {
			return res, err
		}
		if !ok {
			continue
		}
		animeID, err := s.resolveOrCreateSeasonAnime(ctx, rowID, *sa, root, overrides, metadata)
		if err != nil {
			return res, err
		}

		sa.Availability = domain.AvailabilityCreated
		sa.AnimeID = animeID
		if err := s.repo.UpdateSeasonAnime(ctx, *sa); err != nil {
			return res, err
		}
		res.Created = append(res.Created, sa.RawName)
	}
	return res, nil
}

// loadCreatableSeasonAnime loads a row that is eligible for anime creation.
func (s *Service) loadCreatableSeasonAnime(ctx context.Context, rowID string) (*domain.SeasonAnime, bool, error) {
	sa, err := s.repo.SeasonAnimeByID(ctx, rowID)
	if err != nil {
		return nil, false, err
	}
	if sa == nil || sa.Availability != domain.AvailabilityAvailable {
		return nil, false, nil
	}
	return sa, true, nil
}

// resolveOrCreateSeasonAnime resolves an existing anime or creates a new one.
// The row's own raw name, matched page and resolved folder always win; metadata
// only travels alongside them for the fields the row itself never holds.
func (s *Service) resolveOrCreateSeasonAnime(ctx context.Context, rowID string, seasonAnime domain.SeasonAnime, root string, overrides map[string]string, metadata map[string]AnimeCreateMetadata) (string, error) {
	animeID, found, err := s.gateway.FindActiveByPagina(ctx, seasonAnime.MatchedSlug)
	if err != nil {
		return "", err
	}
	if found {
		return animeID, nil
	}
	folder := overrides[rowID]
	if folder == "" {
		folder = deriveDownloadFolder(root, seasonAnime.RawName)
	}
	tipo := defaultAnimeType
	mutation, err := s.gateway.CreateAnime(ctx, AnimeCreateInput{
		Nombre:   seasonAnime.RawName,
		Pagina:   seasonAnime.MatchedSlug,
		Section:  sinVerSection,
		Carpeta:  folder,
		Tipo:     &tipo,
		Metadata: metadataForRow(metadata, rowID),
	})
	if err != nil {
		return "", err
	}
	if err := acceptAnimeMutation(mutation); err != nil {
		return "", err
	}
	return mutation.AnimeID, nil
}

// SetSeasonAnimeMetadata records (or, with the empty string, clears) the
// confirmed MyAnimeList lookup for one intake row. The payload is opaque to this
// context's storage but validated at this write boundary: a non-empty value must
// be a valid JSON object, so a caller can never persist a malformed payload, and
// "" is the clear sentinel written as SQL NULL. An unknown row is an error,
// never a silent no-op. A row whose anime already exists is rejected: its
// metadata already travelled at creation, so recording another could only
// diverge the row from the anime. The write touches only the row — never the
// anime.
func (s *Service) SetSeasonAnimeMetadata(ctx context.Context, rowID, metadataJSON string) error {
	if metadataJSON != "" && !validMetadataJSON(metadataJSON) {
		return ErrInvalidMetadata
	}
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) error {
		if sa.Availability == domain.AvailabilityCreated {
			return ErrSeasonAnimeAlreadyCreated
		}
		sa.MetadataJSON = metadataJSON
		return nil
	})
}

// validMetadataJSON reports whether raw is a valid JSON object. json.Valid
// rejects malformed text (including blank input); the trimmed first byte then
// rejects a valid but non-object payload (array, string, number, null), which is
// never valid metadata. Valid JSON guarantees the trimmed slice is non-empty.
func validMetadataJSON(raw string) bool {
	if !json.Valid([]byte(raw)) {
		return false
	}
	return bytes.TrimSpace([]byte(raw))[0] == '{'
}

// metadataForRow returns the confirmed metadata held for one intake row, or nil
// when the lookup has no entry for it — a row with no metadata must create
// exactly the anime it creates without any lookup.
func metadataForRow(metadata map[string]AnimeCreateMetadata, rowID string) *AnimeCreateMetadata {
	confirmed, ok := metadata[rowID]
	if !ok {
		return nil
	}
	return &confirmed
}

// ConfirmSelection reconciles the OPEN season's created candidates against their
// derived verdicts: approved animes become Viendo/active, rejected ones "No me
// gusto"/inactive (soft delete only), applied through the anime gateway. It is a
// repeatable, bidirectional milestone — re-confirming after a consideration or
// min-grade change restores or rejects animes symmetrically. A quota overflow
// (approved > slots) blocks the whole confirmation.
func (s *Service) ConfirmSelection(ctx context.Context) (ConfirmResult, error) {
	if s.gateway == nil {
		return ConfirmResult{}, ErrSelectionDepsUnavailable
	}
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return ConfirmResult{}, err
	}
	if active == nil {
		return ConfirmResult{}, ErrNoActiveSeason
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, active.ID)
	if err != nil {
		return ConfirmResult{}, err
	}

	intents := domain.Reconcile(rows, active.MinApprovalGrade)
	approved := domain.ApprovedCount(intents)
	if approved > active.Slots {
		return ConfirmResult{Approved: approved}, ErrQuotaExceeded
	}

	for _, intent := range intents {
		result, err := s.gateway.SetSelection(ctx, intent.AnimeID, intent.Estado, intent.Activo)
		if err != nil {
			return ConfirmResult{}, err
		}
		if err := acceptAnimeMutation(result); err != nil {
			return ConfirmResult{}, err
		}
	}

	active.MarkSelectionConfirmed(s.now())
	if err := s.repo.UpdateSeason(ctx, *active); err != nil {
		return ConfirmResult{}, err
	}
	return ConfirmResult{Approved: approved, Rejected: len(intents) - approved}, nil
}
