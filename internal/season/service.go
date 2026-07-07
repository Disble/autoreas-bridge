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

// Estrenos section names used by the season conveyor.
const (
	sinVerSection = "Sin ver"
	verHoySection = "Ver hoy"
	vistoSection  = "Visto"
)

// RecheckResult summarizes one availability recheck run.
type RecheckResult struct {
	// Created is the names that became available this run (created or linked).
	Created []string
	// Checked is how many still-waiting rows were probed.
	Checked int
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

// ReconcileIntake sets the season's UNCREATED intake to exactly the given
// plain-text names (the raw editor's source of truth): names not present are
// added as pending, editable rows no longer present are discarded, and a
// removed-then-readded name revives its discarded row (no duplicate). CREATED
// rows are never touched — a created anime has a real record that can only be
// removed by an explicit "remove from season", never by a stray text edit.
func (s *Service) ReconcileIntake(ctx context.Context, seasonID, rawText string) error {
	desired := map[string]string{} // key → display name
	for _, name := range parseIntakeNames(rawText) {
		desired[strings.ToLower(name)] = name
	}

	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return err
	}

	createdKeys := map[string]struct{}{}
	editable := map[string]domain.SeasonAnime{}
	discarded := map[string]domain.SeasonAnime{}
	for _, row := range rows {
		key := strings.ToLower(strings.TrimSpace(row.RawName))
		switch {
		case row.Availability == domain.AvailabilityCreated:
			createdKeys[key] = struct{}{}
		case row.MatchStatus == domain.MatchDiscarded:
			discarded[key] = row
		default:
			editable[key] = row
		}
	}

	// Discard editable rows no longer in the desired list.
	for key, row := range editable {
		if _, want := desired[key]; !want {
			row.MatchStatus = domain.MatchDiscarded
			if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
				return err
			}
		}
	}

	// Add or revive every desired name that is not already editable or created.
	for key, name := range desired {
		if _, isCreated := createdKeys[key]; isCreated {
			continue
		}
		if _, isEditable := editable[key]; isEditable {
			continue
		}
		if row, wasDiscarded := discarded[key]; wasDiscarded {
			row.MatchStatus = domain.MatchPending
			row.MatchedSlug = ""
			row.Candidates = nil
			if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
				return err
			}
			continue
		}
		if err := s.repo.CreateSeasonAnime(ctx, domain.NewSeasonAnime(s.newID(), seasonID, name, s.now())); err != nil {
			return err
		}
	}
	return nil
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

// RecheckAvailability probes ch.1 availability for every matched, still-waiting
// row. Newly-available animes are linked to an existing active anime with the
// same page (two-cour continuation) or created into "Sin ver", and the row
// advances to created. A probe error leaves that row waiting (the run never
// fails as a whole). Idempotent: created rows are skipped on reruns.
func (s *Service) RecheckAvailability(ctx context.Context, seasonID string) (RecheckResult, error) {
	if s.probe == nil || s.gateway == nil {
		return RecheckResult{}, ErrAvailabilityDepsUnavailable
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return RecheckResult{}, err
	}

	var res RecheckResult
	for _, row := range rows {
		if row.MatchStatus != domain.MatchMatched || row.Availability != domain.AvailabilityWaiting {
			continue
		}
		res.Checked++

		available, probeErr := s.probe.HasChapterOne(ctx, row.MatchedSlug)
		if probeErr != nil || !available {
			// Leave the row waiting; a scrape error must not fail the whole run.
			continue
		}

		animeID, found, err := s.gateway.FindActiveByPagina(ctx, row.MatchedSlug)
		if err != nil {
			return res, err
		}
		if !found {
			animeID, err = s.gateway.CreateAnime(ctx, AnimeCreateInput{
				Nombre:  row.RawName,
				Pagina:  row.MatchedSlug,
				Section: sinVerSection,
			})
			if err != nil {
				return res, err
			}
		}

		row.Availability = domain.AvailabilityCreated
		row.AnimeID = animeID
		if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
			return res, err
		}
		res.Created = append(res.Created, row.RawName)
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
			return s.gateway.MoveToSection(ctx, animeID, vistoSection)
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
