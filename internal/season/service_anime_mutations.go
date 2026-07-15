package season

import (
	"context"

	"autoreas-bridge/internal/season/domain"
)

// CreateSeasonAnimes is the explicit, user-initiated creation gate: for each row
// that is currently AVAILABLE, it links an existing active anime with the same
// page (two-cour continuation) or creates a new one into "Sin ver", advancing the
// row to created. Rows that are not available (waiting) or already created are
// skipped — creation is irreversible (soft delete only), so it only ever acts on
// what the user explicitly picked. No download is triggered here.
func (s *Service) CreateSeasonAnimes(ctx context.Context, rowIDs []string, root string, overrides map[string]string) (CreateResult, error) {
	if s.gateway == nil {
		return CreateResult{}, ErrAvailabilityDepsUnavailable
	}
	var res CreateResult
	for _, rowID := range rowIDs {
		sa, err := s.repo.SeasonAnimeByID(ctx, rowID)
		if err != nil {
			return res, err
		}
		if sa == nil || sa.Availability != domain.AvailabilityAvailable {
			continue
		}

		animeID, found, err := s.gateway.FindActiveByPagina(ctx, sa.MatchedSlug)
		if err != nil {
			return res, err
		}
		if !found {
			// A user-picked override wins; otherwise the folder defaults to the
			// configured downloads root joined with the sanitized anime name. A
			// LINKED existing anime (found) keeps its own folder untouched.
			folder := overrides[rowID]
			if folder == "" {
				folder = deriveDownloadFolder(root, sa.RawName)
			}
			mutation, createErr := s.gateway.CreateAnime(ctx, AnimeCreateInput{
				Nombre:  sa.RawName,
				Pagina:  sa.MatchedSlug,
				Section: sinVerSection,
				Carpeta: folder,
			})
			if createErr != nil {
				return res, createErr
			}
			if err := acceptAnimeMutation(mutation); err != nil {
				return res, err
			}
			animeID = mutation.AnimeID
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

// HandleAnimeWatched is the event-driven Ver hoy → Visto auto-transition: when a
// created season anime sitting in "Ver hoy" is watched (nrocapvisto >= 1 — they
// start at 0), it moves to "Visto". Called on every anime change; it early-returns
// for anything that is not a watched Ver hoy anime, so it is cheap.
func (s *Service) HandleAnimeWatched(ctx context.Context, animeID, section string, nrocapvisto float64) error {
	if s.gateway == nil || section != verHoySection || nrocapvisto < 1 || animeID == "" {
		return nil
	}
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil || active == nil {
		return err
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, active.ID)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.AnimeID == animeID && row.Availability == domain.AvailabilityCreated {
			result, err := s.gateway.MoveToSection(ctx, animeID, vistoSection)
			if err != nil {
				return err
			}
			return acceptAnimeMutation(result)
		}
	}
	return nil
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
