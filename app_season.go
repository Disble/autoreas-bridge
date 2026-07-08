package main

import (
	"context"
	"errors"
	"time"

	"autoreas-bridge/internal/api/contracts"
	apiHandlers "autoreas-bridge/internal/api/handlers"
	"autoreas-bridge/internal/schedule"
	"autoreas-bridge/internal/season"
	"autoreas-bridge/internal/season/domain"
)

// seasonWeekdays is the weekday vocabulary (Spanish data literals — they ARE the
// dias values) used to discriminate a weekday placement from an Estrenos section.
var seasonWeekdays = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
}

// SeasonDTO is the Wails-facing projection of the active season. Timestamps are
// epoch milliseconds (nullable milestones are pointers → JSON null).
type SeasonDTO struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	MinApprovalGrade     int    `json:"minApprovalGrade"`
	Slots                int    `json:"slots"`
	Status               string `json:"status"`
	SelectionConfirmedAt *int64 `json:"selectionConfirmedAt"`
	AppliedAt            *int64 `json:"appliedAt"`
	ClosedAt             *int64 `json:"closedAt"`
	CreatedAt            int64  `json:"createdAt"`
}

// GetSeason returns the active (open) season, or null when none is open or the
// season service is unavailable. Never panics.
func (a *App) GetSeason() *SeasonDTO {
	if a.seasonService == nil {
		return nil
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return nil
	}
	dto := seasonToDTO(active)
	return &dto
}

// CreateSeason opens a new season. Returns "ok" on success, or a descriptive
// error string (service unavailable, a season already open, write failure).
func (a *App) CreateSeason(name string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if _, err := a.seasonService.CreateSeason(a.seasonCtx(), name); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonMinApprovalGrade updates the open season's minimum approval grade.
func (a *App) SetSeasonMinApprovalGrade(grade int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetMinApprovalGrade(a.seasonCtx(), grade); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonSlots updates the open season's approved-anime cap.
func (a *App) SetSeasonSlots(slots int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetSlots(a.seasonCtx(), slots); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// CloseSeason transitions the open season to its terminal closed state.
func (a *App) CloseSeason() string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.CloseSeason(a.seasonCtx()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SeasonAnimeCandidateDTO is one ranked match option for an ambiguous intake row.
type SeasonAnimeCandidateDTO struct {
	Title   string  `json:"title"`
	PageURL string  `json:"pageUrl"`
	Score   float64 `json:"score"`
}

// SeasonAnimeDTO is the Wails-facing projection of one intake/matching row.
// Section is the created anime's current Estrenos section (Sin ver / Ver hoy /
// Visto), empty for uncreated rows. Grade/GradeSource/RatedAt/SkipGrading carry
// the SDD-44 first-episode grade (grade 0 = ungraded, ratedAt null until graded).
type SeasonAnimeDTO struct {
	ID                string                    `json:"id"`
	RawName           string                    `json:"rawName"`
	MatchStatus       string                    `json:"matchStatus"`
	MatchedSlug       string                    `json:"matchedSlug"`
	Candidates        []SeasonAnimeCandidateDTO `json:"candidates"`
	Availability      string                    `json:"availability"`
	AvailableChapters int                       `json:"availableChapters"`
	AnimeID           string                    `json:"animeId"`
	Section           string                    `json:"section"`
	Grade             int                       `json:"grade"`
	GradeSource       string                    `json:"gradeSource"`
	RatedAt           *int64                    `json:"ratedAt"`
	SkipGrading       bool                      `json:"skipGrading"`
	Consideration     string                    `json:"consideration"`
}

// GetSeasonAnimes returns the active season's intake rows, or an empty list when
// no season is open or the service is unavailable.
func (a *App) GetSeasonAnimes() []SeasonAnimeDTO {
	if a.seasonService == nil {
		return []SeasonAnimeDTO{}
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return []SeasonAnimeDTO{}
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), active.ID)
	if err != nil {
		return []SeasonAnimeDTO{}
	}
	return a.seasonAnimeDTOs(a.seasonCtx(), rows)
}

// seasonAnimeDTOs maps a season's intake rows to DTOs, overlaying each created
// anime's current Estrenos section. Shared by the active and past-season reads.
func (a *App) seasonAnimeDTOs(ctx context.Context, rows []domain.SeasonAnime) []SeasonAnimeDTO {
	sections := a.animeSectionsByID(ctx)
	out := make([]SeasonAnimeDTO, 0, len(rows))
	for _, r := range rows {
		dto := seasonAnimeToDTO(r)
		if r.AnimeID != "" {
			dto.Section = sections[r.AnimeID]
		}
		out = append(out, dto)
	}
	return out
}

// ImportSeasonIntake imports a plain-text intake list into the active season.
func (a *App) ImportSeasonIntake(rawText string) string {
	return a.withActiveSeason(func(seasonID string) error {
		_, err := a.seasonService.ImportIntake(a.seasonCtx(), seasonID, rawText)
		return err
	})
}

// ReconcileSeasonIntake sets the active season's uncreated intake to exactly the
// pasted names (the raw editor's source of truth): add missing, discard removed,
// preserve created rows.
func (a *App) ReconcileSeasonIntake(rawText string) string {
	return a.withActiveSeason(func(seasonID string) error {
		return a.seasonService.ReconcileIntake(a.seasonCtx(), seasonID, rawText)
	})
}

// RunSeasonMatching resolves every pending intake row against jkanime.
func (a *App) RunSeasonMatching() string {
	return a.withActiveSeason(func(seasonID string) error {
		if err := a.seasonService.RunMatching(a.seasonCtx(), seasonID); err != nil {
			return err
		}
		res, err := a.seasonService.RecheckAvailability(a.seasonCtx(), seasonID)
		if err != nil && !errors.Is(err, season.ErrAvailabilityDepsUnavailable) {
			return err
		}
		if len(res.Available) > 0 {
			a.notifySeasonAvailable(a.seasonCtx(), res.Available)
		}
		return nil
	})
}

// ResolveSeasonMatch manually resolves an intake row to a page URL.
func (a *App) ResolveSeasonMatch(rowID, pageURL string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.ResolveMatch(a.seasonCtx(), rowID, pageURL); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// DiscardSeasonName marks an intake row discarded.
func (a *App) DiscardSeasonName(rowID string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.DiscardName(a.seasonCtx(), rowID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonGrade records a MANUAL first-episode grade (1–6) for an anime in the
// active season — the Chapters card / Evaluation panel rate action. Manual always
// wins over a mobile grade. Returns "ok" or a descriptive error string.
func (a *App) SetSeasonGrade(animeID string, grade int) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if _, err := a.seasonService.RecordPremiereGrade(a.seasonCtx(), animeID, grade, domain.GradeSourceManual, time.Now()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SkipSeasonGrading records the explicit "no grade" override for a season row
// (visible at selection; never a lock).
func (a *App) SkipSeasonGrading(rowID string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SkipGrading(a.seasonCtx(), rowID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SaveSeasonOrderingDraft persists the ordering board's scratch draft (weekday
// placements as JSON) on the open season.
func (a *App) SaveSeasonOrderingDraft(draftJSON string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SaveOrderingDraft(a.seasonCtx(), draftJSON); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// ApplyScheduleDTO is the Wails-facing result of applying the ordering schedule.
type ApplyScheduleDTO struct {
	Status  string   `json:"status"`
	Applied int      `json:"applied"`
	Failed  []string `json:"failed"`
}

// ApplySeasonSchedule writes the drafted day+order to every changed anime (soft
// state only) and stamps the applied milestone on a clean run; a partial failure
// reports the failed anime ids and leaves the milestone unset for a safe re-apply.
func (a *App) ApplySeasonSchedule() ApplyScheduleDTO {
	if a.seasonService == nil {
		return ApplyScheduleDTO{Status: "season service unavailable"}
	}
	res, err := a.seasonService.ApplySchedule(a.seasonCtx())
	if err != nil {
		return ApplyScheduleDTO{Status: err.Error(), Applied: res.Applied, Failed: res.Failed}
	}
	a.broadcastSeasonChanged()
	status := "ok"
	if len(res.Failed) > 0 {
		status = "partial"
	}
	return ApplyScheduleDTO{Status: status, Applied: res.Applied, Failed: res.Failed}
}

// ReopenSeasonOrdering clears the applied milestone so the board is editable again.
func (a *App) ReopenSeasonOrdering() string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.ReopenOrdering(a.seasonCtx()); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// OrderingCardDTO is one anime on the ordering board: on a weekday (grid) it
// carries Dia+Orden; awaiting placement (rail) it carries its current Section.
type OrderingCardDTO struct {
	AnimeID    string `json:"animeId"`
	Name       string `json:"name"`
	Dia        string `json:"dia"`
	Orden      int    `json:"orden"`
	Section    string `json:"section"`
	IsNewcomer bool   `json:"isNewcomer"`
}

// OrderingBoardDTO is the ordering board's read model: the rail (approved season
// candidates awaiting a weekday) and the grid (all active animes already on
// weekdays). Read-only in the UI while AppliedAt is set.
type OrderingBoardDTO struct {
	Rail      []OrderingCardDTO `json:"rail"`
	Grid      []OrderingCardDTO `json:"grid"`
	AppliedAt *int64            `json:"appliedAt"`
}

// GetSeasonOrderingBoard aggregates the ordering board: the rail is the approved
// (verdict Aprobado, linked, still in an Estrenos section) season candidates; the
// grid is every active anime already scheduled on a weekday (continuing titles +
// placed newcomers). Newcomers (this season's approved) are flagged.
func (a *App) GetSeasonOrderingBoard() OrderingBoardDTO {
	empty := OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}}
	if a.seasonService == nil || a.animeQuery == nil {
		return empty
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil || active == nil {
		return empty
	}
	rows, err := a.seasonService.ListSeasonAnimes(a.seasonCtx(), active.ID)
	if err != nil {
		return empty
	}
	approved := map[string]bool{}
	for _, r := range rows {
		if r.Availability != domain.AvailabilityCreated || r.AnimeID == "" {
			continue
		}
		if domain.Decision(r.Grade, active.MinApprovalGrade, r.Consideration) == domain.VerdictApproved {
			approved[r.AnimeID] = true
		}
	}

	animes, err := a.animeQuery.ListMobileAnimes(a.seasonCtx())
	if err != nil {
		return empty
	}
	board := OrderingBoardDTO{Rail: []OrderingCardDTO{}, Grid: []OrderingCardDTO{}, AppliedAt: millisPtrDTO(active.AppliedAt)}
	for _, m := range animes {
		if m.Activo != 1 {
			continue
		}
		if weekdays := weekdayPlacements(m.Dias); len(weekdays) > 0 {
			// One grid card per weekday placement: an anime that airs on several days
			// shows as a clone in each column (Legacy multi-day ordering).
			for _, d := range weekdays {
				board.Grid = append(board.Grid, OrderingCardDTO{
					AnimeID: m.ID, Name: m.Nombre, Dia: d.Dia, Orden: d.Orden, IsNewcomer: approved[m.ID],
				})
			}
			continue
		}
		if approved[m.ID] {
			section, orden := "", 0
			if len(m.Dias) > 0 {
				section, orden = m.Dias[0].Dia, m.Dias[0].Orden
			}
			board.Rail = append(board.Rail, OrderingCardDTO{
				AnimeID: m.ID, Name: m.Nombre, Section: section, Orden: orden, IsNewcomer: true,
			})
		}
	}
	return board
}

// weekdayPlacements returns every weekday dias entry (an anime may air on more than
// one day — Legacy multi-day ordering), skipping Estrenos-section entries.
func weekdayPlacements(dias []contracts.MobileAnimeDay) []contracts.MobileAnimeDay {
	out := make([]contracts.MobileAnimeDay, 0, len(dias))
	for _, d := range dias {
		if _, ok := seasonWeekdays[d.Dia]; ok {
			out = append(out, d)
		}
	}
	return out
}

// withActiveSeason resolves the open season id and runs fn, broadcasting on
// success. Returns "ok" or a descriptive error string.
func (a *App) withActiveSeason(fn func(seasonID string) error) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	active, err := a.seasonService.ActiveSeason(a.seasonCtx())
	if err != nil {
		return err.Error()
	}
	if active == nil {
		return "no active season"
	}
	if err := fn(active.ID); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

func seasonAnimeToDTO(r domain.SeasonAnime) SeasonAnimeDTO {
	candidates := make([]SeasonAnimeCandidateDTO, 0, len(r.Candidates))
	for _, c := range r.Candidates {
		candidates = append(candidates, SeasonAnimeCandidateDTO{Title: c.Title, PageURL: c.PageURL, Score: c.Score})
	}
	return SeasonAnimeDTO{
		ID:                r.ID,
		RawName:           r.RawName,
		MatchStatus:       string(r.MatchStatus),
		MatchedSlug:       r.MatchedSlug,
		Candidates:        candidates,
		Availability:      string(r.Availability),
		AvailableChapters: r.AvailableChapters,
		AnimeID:           r.AnimeID,
		Grade:             r.Grade,
		GradeSource:       string(r.GradeSource),
		RatedAt:           millisPtrDTO(r.RatedAt),
		SkipGrading:       r.SkipGrading,
		Consideration:     string(r.Consideration),
	}
}

// CreateSeasonAnimes is the explicit, user-initiated creation gate: it creates
// the anime(s) for the given AVAILABLE intake rows into "Sin ver" (irreversible,
// soft-delete only), skipping rows that are not available or already created.
// Each new anime's download folder defaults to the configured downloads root
// joined with its sanitized name; folders maps a rowID to a user-picked override
// that wins over that default. No download is triggered — that happens only on
// Send to Ver hoy.
func (a *App) CreateSeasonAnimes(rowIDs []string, folders map[string]string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	root := ""
	if a.settingsStore != nil {
		r, err := a.settingsStore.DownloadsRoot(a.seasonCtx())
		if err != nil {
			return err.Error()
		}
		root = r
	}
	if _, err := a.seasonService.CreateSeasonAnimes(a.seasonCtx(), rowIDs, root, folders); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// SetSeasonConsideration sets a candidate's selection override (the Consideración
// Select in the selection board).
func (a *App) SetSeasonConsideration(rowID, consideration string) string {
	if a.seasonService == nil {
		return "season service unavailable"
	}
	if err := a.seasonService.SetConsideration(a.seasonCtx(), rowID, domain.Consideration(consideration)); err != nil {
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// ConfirmSelectionDTO is the Wails-facing result of confirming the selection:
// "ok" or an error message, the approved/rejected counts, and a quota-overflow
// flag so the UI can surface the one hard rule distinctly.
type ConfirmSelectionDTO struct {
	Status        string `json:"status"`
	Approved      int    `json:"approved"`
	Rejected      int    `json:"rejected"`
	QuotaExceeded bool   `json:"quotaExceeded"`
}

// ConfirmSeasonSelection reconciles the open season's verdicts into anime writes
// (approve → Viendo/active, reject → No me gusto/inactive; soft delete only).
// Repeatable while the season is open. A quota overflow blocks and is flagged.
func (a *App) ConfirmSeasonSelection() ConfirmSelectionDTO {
	if a.seasonService == nil {
		return ConfirmSelectionDTO{Status: "season service unavailable"}
	}
	res, err := a.seasonService.ConfirmSelection(a.seasonCtx())
	if err != nil {
		return ConfirmSelectionDTO{
			Status:        err.Error(),
			Approved:      res.Approved,
			QuotaExceeded: errors.Is(err, season.ErrQuotaExceeded),
		}
	}
	a.broadcastSeasonChanged()
	return ConfirmSelectionDTO{Status: "ok", Approved: res.Approved, Rejected: res.Rejected}
}

// recordSeasonRating is the API seam for mobile-sourced grade ingestion: it maps
// the season service's domain outcomes to the transport-neutral result the HTTP/WS
// handlers translate into status codes, and broadcasts season_changed on success.
// Returns nil when the season feature is unavailable (the route then reports 503).
func (a *App) recordSeasonRating() apiHandlers.RecordSeasonRatingFunc {
	if a.seasonService == nil {
		return nil
	}
	return func(ctx context.Context, animeID string, grade int, ratedAtMs int64) (apiHandlers.SeasonRatingResult, error) {
		row, err := a.seasonService.RecordPremiereGrade(ctx, animeID, grade, domain.GradeSourceMobileSync, time.UnixMilli(ratedAtMs))
		switch {
		case err == nil:
			a.broadcastSeasonChanged()
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingRecorded}, nil
		case errors.Is(err, season.ErrInvalidGrade):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingInvalidGrade}, nil
		case errors.Is(err, season.ErrNotSeasonCandidate):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingNotCandidate}, nil
		case errors.Is(err, season.ErrManualGradePresent):
			return apiHandlers.SeasonRatingResult{Outcome: apiHandlers.SeasonRatingManualConflict, ExistingGrade: row.Grade}, nil
		default:
			return apiHandlers.SeasonRatingResult{}, err
		}
	}
}

// RecheckSeasonAvailability triggers an out-of-band availability recheck now
// (the Daily Board's "Re-check now"). Reuses the scheduler run guard; an
// already-running recheck is reported as success.
func (a *App) RecheckSeasonAvailability() string {
	if a.seasonScheduler == nil {
		return "season availability unavailable"
	}
	if err := a.seasonScheduler.TriggerNow(a.seasonCtx(), "manual"); err != nil {
		if errors.Is(err, schedule.ErrRunInProgress) {
			return "ok"
		}
		return err.Error()
	}
	a.broadcastSeasonChanged()
	return "ok"
}

// broadcastSeasonChanged pushes the current active-season snapshot to connected
// clients (empty id / "closed" status when no season is open). Because season
// mode is derived from the open season (SDD-41b), it ALSO re-broadcasts the
// derived season-mode flag over preferences_changed so mobile and the
// download/chapters season-mode readers update on open/close.
func (a *App) broadcastSeasonChanged() {
	if a.realtimeHub == nil {
		return
	}
	id, status := "", "closed"
	seasonMode := false
	if dto := a.GetSeason(); dto != nil {
		id, status, seasonMode = dto.ID, dto.Status, true
	}
	a.realtimeHub.BroadcastSeasonChanged(a.seasonCtx(), id, status)
	a.realtimeHub.BroadcastPreferencesChanged(a.seasonCtx(), seasonMode)
}

// seasonToDTO projects a domain season into the Wails DTO.
func seasonToDTO(s *domain.Season) SeasonDTO {
	dto := SeasonDTO{
		ID:               s.ID,
		Name:             s.Name,
		MinApprovalGrade: s.MinApprovalGrade,
		Slots:            s.Slots,
		Status:           string(s.Status),
		CreatedAt:        s.CreatedAt.UnixMilli(),
	}
	dto.SelectionConfirmedAt = millisPtrDTO(s.SelectionConfirmedAt)
	dto.AppliedAt = millisPtrDTO(s.AppliedAt)
	dto.ClosedAt = millisPtrDTO(s.ClosedAt)
	return dto
}

// millisPtrDTO converts an optional time into a nullable epoch-ms pointer.
func millisPtrDTO(t *time.Time) *int64 {
	if t == nil {
		return nil
	}
	ms := t.UnixMilli()
	return &ms
}

// seasonCtx returns a.ctx, falling back to context.Background() before startup.
func (a *App) seasonCtx() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
