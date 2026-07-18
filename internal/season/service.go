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

// ErrAvailabilityDepsUnavailable is returned by RecheckAvailability when the
// probe/gateway deps are not wired.
var ErrAvailabilityDepsUnavailable = errors.New("availability probe/gateway unavailable")

// ErrInvalidGrade is returned by RecordPremiereGrade when the grade is outside 1–6.
var ErrInvalidGrade = errors.New("grade out of range")

// ErrNotSeasonCandidate is returned by RecordPremiereGrade when no open-season row
// is linked to the given anime (no open season, or the anime is not a candidate).
var ErrNotSeasonCandidate = errors.New("anime is not an active season candidate")

// ErrManualGradePresent is returned by RecordPremiereGrade when a mobile_sync grade
// is rejected because a manual grade already exists; the manual grade is kept and
// returned so the caller can surface it (the sync 409 body).
var ErrManualGradePresent = errors.New("manual grade present")

// ErrInvalidConsideration is returned by SetConsideration for an unknown value.
var ErrInvalidConsideration = errors.New("unknown consideration")

// ErrSelectionDepsUnavailable is returned by ConfirmSelection when the anime
// gateway is not wired.
var ErrSelectionDepsUnavailable = errors.New("selection anime gateway unavailable")

// ErrQuotaExceeded is returned by ConfirmSelection when the approved animes
// exceed the season's slots; the user resolves it via Insufficient quota.
var ErrQuotaExceeded = errors.New("approved animes exceed the season slots")

// ErrInvalidOrderingDraft is returned when the saved ordering draft puts the same
// anime on the same weekday more than once.
var ErrInvalidOrderingDraft = errors.New("ordering draft contains duplicate weekday placements")

// ConfirmResult summarizes one selection confirmation.
type ConfirmResult struct {
	Approved int
	Rejected int
}

// Estrenos section names used by the season conveyor.
const (
	sinVerSection = "Sin ver"
	verHoySection = "Ver hoy"
	vistoSection  = "Visto"
)

// RecheckResult summarizes one availability recheck run. It NEVER creates
// anything — it only reports which names newly became available to create.
type RecheckResult struct {
	// Available is the names that newly transitioned to available this run.
	Available []string
	// Checked is how many matched, uncreated rows were probed.
	Checked int
}

// CreateResult summarizes one explicit create-animes action.
type CreateResult struct {
	// Created is the names of the animes created (or linked) this run.
	Created []string
}

// Service is the season application service. Time and id generation are injected
// so the service is deterministic under test; the NameSearcher may be nil (then
// RunMatching errors, but every other operation still works).
type Service struct {
	repo     Repository
	now      func() time.Time
	newID    func() string
	searcher NameSearcher
	probe    AvailabilityProbe
	gateway  AnimeGateway
}

// SetAvailabilityDeps wires the availability probe + anime gateway (SDD-43).
// Mirrors the optional-setter convention; RecheckAvailability errors until both
// are set, every other operation works without them.
func (s *Service) SetAvailabilityDeps(probe AvailabilityProbe, gateway AnimeGateway) {
	s.probe = probe
	s.gateway = gateway
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

// ListSeasons returns every season (open + closed), newest first, for the
// past-seasons history view shown when no season is open.
func (s *Service) ListSeasons(ctx context.Context) ([]domain.Season, error) {
	return s.repo.ListSeasons(ctx)
}

// SeasonByID returns a single season by id (open or past), or (nil, nil) when
// absent — the read-only detail view loads a past season through it.
func (s *Service) SeasonByID(ctx context.Context, id string) (*domain.Season, error) {
	return s.repo.SeasonByID(ctx, id)
}

// SetMinApprovalGrade updates the open season's cutoff grade.
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

// RecordPremiereGrade records a first-episode grade for the anime linked to a row
// in the OPEN season, applying the domain conflict rule (manual protected from
// mobile). It validates the 1–6 bound and returns the updated row. A mobile write
// rejected by an existing manual grade returns that row with ErrManualGradePresent
// so the caller can surface the kept grade. Idempotent for mobile self-writes.
func (s *Service) RecordPremiereGrade(ctx context.Context, animeID string, grade int, source domain.GradeSource, ratedAt time.Time) (domain.SeasonAnime, error) {
	if grade < 1 || grade > 6 {
		return domain.SeasonAnime{}, ErrInvalidGrade
	}
	if animeID == "" {
		return domain.SeasonAnime{}, ErrNotSeasonCandidate
	}
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return domain.SeasonAnime{}, err
	}
	if active == nil {
		return domain.SeasonAnime{}, ErrNotSeasonCandidate
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, active.ID)
	if err != nil {
		return domain.SeasonAnime{}, err
	}
	for _, row := range rows {
		if row.AnimeID != animeID {
			continue
		}
		if !row.ApplyGrade(grade, source, ratedAt) {
			return row, ErrManualGradePresent
		}
		if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
			return domain.SeasonAnime{}, err
		}
		return row, nil
	}
	return domain.SeasonAnime{}, ErrNotSeasonCandidate
}

// SkipGrading records the explicit "no grade" override for a row (visible at
// selection; never a lock).
func (s *Service) SkipGrading(ctx context.Context, rowID string) error {
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) {
		sa.Skip()
	})
}

// SetConsideration sets a row's selection override, validating the value.
// Verdicts are never stored — this is the only selection fact written.
func (s *Service) SetConsideration(ctx context.Context, rowID string, c domain.Consideration) error {
	if !validConsideration(c) {
		return ErrInvalidConsideration
	}
	return s.mutateSeasonAnime(ctx, rowID, func(sa *domain.SeasonAnime) {
		sa.Consideration = c
	})
}

// validConsideration reports whether a consideration value is supported.
func validConsideration(c domain.Consideration) bool {
	switch c {
	case domain.ConsiderationNone, domain.ConsiderationInsufficientQuota,
		domain.ConsiderationTemporarilyApproved, domain.ConsiderationSpareQuota:
		return true
	default:
		return false
	}
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

// mutateSeasonAnime loads, mutates, and persists one season anime row.
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

// toMatchStatus converts a matcher status to its domain representation.
func toMatchStatus(s match.Status) domain.MatchStatus {
	switch s {
	case match.StatusMatched:
		return domain.MatchMatched
	case match.StatusAmbiguous:
		return domain.MatchAmbiguous
	default:
		return domain.MatchNotFound
	}
}

// toDomainCandidates converts matcher candidates to domain candidates.
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
