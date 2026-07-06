// Package season is the season-selection bounded context: the Season aggregate,
// its persistence port, and the application service that drives the workspace
// lifecycle. It depends only on internal/persistence and its own domain
// sub-package; other contexts are reached through injected ports (added by
// later slices).
package season

import (
	"context"
	"errors"
	"strings"
	"time"

	"autoreas-bridge/internal/season/domain"
	"autoreas-bridge/internal/season/match"
)

// ErrSeasonAlreadyOpen is returned by CreateSeason when an open season exists.
var ErrSeasonAlreadyOpen = errors.New("a season is already open")

// ErrNoActiveSeason is returned by mutating operations when no season is open.
var ErrNoActiveSeason = errors.New("no active season")

// ErrSeasonAnimeNotFound is returned when an intake row id does not exist.
var ErrSeasonAnimeNotFound = errors.New("season anime not found")

// ErrSearcherUnavailable is returned by RunMatching when no NameSearcher is wired.
var ErrSearcherUnavailable = errors.New("name searcher unavailable")

// Service is the season application service. Time and id generation are injected
// so the service is deterministic under test; the NameSearcher may be nil (then
// RunMatching errors, but every other operation still works).
type Service struct {
	repo     Repository
	now      func() time.Time
	newID    func() string
	searcher NameSearcher
}

// NewService builds the service over a Repository, a clock, an id generator, and
// a NameSearcher (nil-tolerant).
func NewService(repo Repository, now func() time.Time, newID func() string, searcher NameSearcher) *Service {
	return &Service{repo: repo, now: now, newID: newID, searcher: searcher}
}

// CreateSeason opens a new season, rejecting the attempt when one is already
// open (belt-and-suspenders over the storage-layer single-open index).
func (s *Service) CreateSeason(ctx context.Context, name string) (domain.Season, error) {
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return domain.Season{}, err
	}
	if active != nil {
		return domain.Season{}, ErrSeasonAlreadyOpen
	}
	season := domain.NewSeason(s.newID(), name, s.now())
	if err := s.repo.CreateSeason(ctx, season); err != nil {
		return domain.Season{}, err
	}
	return season, nil
}

// ActiveSeason returns the open season, or (nil, nil) when none is open.
func (s *Service) ActiveSeason(ctx context.Context) (*domain.Season, error) {
	return s.repo.ActiveSeason(ctx)
}

// SetMinApprovalGrade updates the open season's nota de corte.
func (s *Service) SetMinApprovalGrade(ctx context.Context, grade int) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.SetMinApprovalGrade(grade) })
}

// SetSlots updates the open season's approved-anime cap.
func (s *Service) SetSlots(ctx context.Context, slots int) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.SetSlots(slots) })
}

// CloseSeason transitions the open season to its terminal closed state.
func (s *Service) CloseSeason(ctx context.Context) error {
	return s.mutateActive(ctx, func(se *domain.Season) error { return se.Close(s.now()) })
}

// ListSeasonAnimes returns a season's intake rows in creation order.
func (s *Service) ListSeasonAnimes(ctx context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	return s.repo.ListSeasonAnimes(ctx, seasonID)
}

// ImportIntake parses a plain-text intake list (one name per line), trims and
// de-duplicates it, and creates a pending row per name. Returns the number of
// rows created. The intake stays a living list — importing again adds only the
// names not already present.
func (s *Service) ImportIntake(ctx context.Context, seasonID, rawText string) (int, error) {
	existing, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return 0, err
	}
	seen := map[string]struct{}{}
	for _, r := range existing {
		seen[strings.ToLower(strings.TrimSpace(r.RawName))] = struct{}{}
	}

	created := 0
	for _, name := range parseIntakeNames(rawText) {
		key := strings.ToLower(name)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		if err := s.repo.CreateSeasonAnime(ctx, domain.NewSeasonAnime(s.newID(), seasonID, name, s.now())); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}

// AddIntakeName adds a single intake name (living-list append), skipping a
// blank name. Returns whether a row was created.
func (s *Service) AddIntakeName(ctx context.Context, seasonID, name string) (bool, error) {
	n, err := s.ImportIntake(ctx, seasonID, name)
	return n > 0, err
}

// RunMatching searches and resolves every pending row, persisting the outcome
// (matched slug, ambiguous candidates, or not_found). Rows already resolved or
// discarded are left untouched.
func (s *Service) RunMatching(ctx context.Context, seasonID string) error {
	if s.searcher == nil {
		return ErrSearcherUnavailable
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.MatchStatus != domain.MatchPending {
			continue
		}
		candidates, err := s.searcher.Search(ctx, row.RawName)
		if err != nil {
			return err
		}
		res := match.Resolve(row.RawName, candidates)
		row.MatchStatus = toMatchStatus(res.Status)
		row.MatchedSlug = res.MatchedSlug
		row.Candidates = toDomainCandidates(res.Candidates)
		if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

// ResolveMatch manually resolves a row to a page URL (candidate pick or a
// pasted URL), overriding the automatic classification.
func (s *Service) ResolveMatch(ctx context.Context, rowID, pageURL string) error {
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) {
		sa.MatchStatus = domain.MatchMatched
		sa.MatchedSlug = pageURL
	})
}

// DiscardName marks a row discarded (it will not advance to availability).
func (s *Service) DiscardName(ctx context.Context, rowID string) error {
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) {
		sa.MatchStatus = domain.MatchDiscarded
	})
}

func (s *Service) mutateSeasonAnime(ctx context.Context, rowID string, fn func(*domain.SeasonAnime)) error {
	sa, err := s.repo.SeasonAnimeByID(ctx, rowID)
	if err != nil {
		return err
	}
	if sa == nil {
		return ErrSeasonAnimeNotFound
	}
	fn(sa)
	return s.repo.UpdateSeasonAnime(ctx, *sa)
}

// parseIntakeNames splits a plain-text list into trimmed, non-empty,
// case-insensitively de-duplicated names in first-seen order.
func parseIntakeNames(rawText string) []string {
	seen := map[string]struct{}{}
	var out []string
	for line := range strings.SplitSeq(rawText, "\n") {
		name := strings.TrimSpace(line)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, name)
	}
	return out
}

func toMatchStatus(s match.MatchStatus) domain.MatchStatus {
	switch s {
	case match.StatusMatched:
		return domain.MatchMatched
	case match.StatusAmbiguous:
		return domain.MatchAmbiguous
	default:
		return domain.MatchNotFound
	}
}

func toDomainCandidates(cs []match.ScoredCandidate) []domain.MatchCandidate {
	if len(cs) == 0 {
		return nil
	}
	out := make([]domain.MatchCandidate, 0, len(cs))
	for _, c := range cs {
		out = append(out, domain.MatchCandidate{Title: c.Title, PageURL: c.PageURL, Score: c.Score})
	}
	return out
}

// mutateActive loads the open season, applies fn, and persists the result.
func (s *Service) mutateActive(ctx context.Context, fn func(*domain.Season) error) error {
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return err
	}
	if active == nil {
		return ErrNoActiveSeason
	}
	if err := fn(active); err != nil {
		return err
	}
	return s.repo.UpdateSeason(ctx, *active)
}
