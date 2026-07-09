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

// RecheckAvailability probes chapter availability for every matched, uncreated
// row and records it (Availability + AvailableChapters) — it NEVER creates an
// anime. It ALSO refreshes AvailableChapters for already-created rows still
// parked in the "Sin ver" Estrenos section (resolved via the batched
// AnimeGateway.CurrentPlacements), leaving Availability/MatchStatus/AnimeID
// untouched so a created row never re-enters the creation-eligible state.
// Creating is a separate, explicit, consent-gated action (creation and
// soft-delete are the only irreversible steps of the workflow). A probe error
// leaves a row unchanged; the run never fails as a whole. res.Checked counts
// every row probed either path. Reports the names that NEWLY became available
// for creation (a row already available, or an already-created row, is never
// reported).
func (s *Service) RecheckAvailability(ctx context.Context, seasonID string) (RecheckResult, error) {
	if s.probe == nil {
		return RecheckResult{}, ErrAvailabilityDepsUnavailable
	}
	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return RecheckResult{}, err
	}

	var createdAnimeIDs []string
	for _, row := range rows {
		if row.Availability == domain.AvailabilityCreated && row.MatchStatus == domain.MatchMatched && row.AnimeID != "" {
			createdAnimeIDs = append(createdAnimeIDs, row.AnimeID)
		}
	}
	var placements map[string][]domain.Placement
	if len(createdAnimeIDs) > 0 {
		// On error, treat every created row as ineligible this run rather than
		// failing the whole call — mirrors the per-row probe-error tolerance below.
		placements, _ = s.gateway.CurrentPlacements(ctx, createdAnimeIDs)
	}

	var res RecheckResult
	for _, row := range rows {
		switch {
		case row.MatchStatus == domain.MatchMatched && row.Availability != domain.AvailabilityCreated:
			res.Checked++

			chapters, probeErr := s.probe.AvailableChapters(ctx, row.MatchedSlug)
			if probeErr != nil {
				// Leave the row unchanged; a scrape error must not fail the whole run.
				continue
			}

			wasAvailable := row.Availability == domain.AvailabilityAvailable
			if chapters >= 1 {
				row.Availability = domain.AvailabilityAvailable
				row.AvailableChapters = chapters
				if !wasAvailable {
					res.Available = append(res.Available, row.RawName)
				}
			} else {
				row.Availability = domain.AvailabilityWaiting
				row.AvailableChapters = 0
			}
			if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
				return res, err
			}

		case row.Availability == domain.AvailabilityCreated && row.MatchStatus == domain.MatchMatched && row.AnimeID != "":
			placed := placements[row.AnimeID]
			if len(placed) == 0 || placed[0].Dia != sinVerSection {
				continue
			}
			res.Checked++
			chapters, probeErr := s.probe.AvailableChapters(ctx, row.MatchedSlug)
			if probeErr != nil {
				continue
			}
			row.AvailableChapters = chapters
			if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
				return res, err
			}
		}
	}
	return res, nil
}

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
			animeID, err = s.gateway.CreateAnime(ctx, AnimeCreateInput{
				Nombre:  sa.RawName,
				Pagina:  sa.MatchedSlug,
				Section: sinVerSection,
				Carpeta: folder,
			})
			if err != nil {
				return res, err
			}
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
		if err := s.gateway.SetSelection(ctx, intent.AnimeID, intent.Estado, intent.Activo); err != nil {
			return ConfirmResult{}, err
		}
	}

	active.MarkSelectionConfirmed(s.now())
	if err := s.repo.UpdateSeason(ctx, *active); err != nil {
		return ConfirmResult{}, err
	}
	return ConfirmResult{Approved: approved, Rejected: len(intents) - approved}, nil
}

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
