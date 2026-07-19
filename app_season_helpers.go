package main

import (
	"time"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/season/domain"
)

// seasonAnimeToDTO maps a season anime domain value to its Wails DTO.
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
		AvailableChapters: r.AvailableEpisodes,
		AnimeID:           r.AnimeID,
		Grade:             r.Grade,
		GradeSource:       string(r.GradeSource),
		RatedAt:           millisPtrDTO(r.RatedAt),
		SkipGrading:       r.SkipGrading,
		Consideration:     string(r.Consideration),
	}
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

// approvedSeasonAnimeIDs returns created anime IDs that meet the approval threshold.
func approvedSeasonAnimeIDs(rows []domain.SeasonAnime, minimumGrade int) map[string]bool {
	approved := map[string]bool{}
	for _, row := range rows {
		if row.Availability == domain.AvailabilityCreated && row.AnimeID != "" && domain.Decision(row.Grade, minimumGrade, row.Consideration) == domain.VerdictApproved {
			approved[row.AnimeID] = true
		}
	}
	return approved
}

// populateOrderingBoard fills the ordering board from active anime placements.
func populateOrderingBoard(board *OrderingBoardDTO, animes []contracts.MobileAnime, approved map[string]bool) {
	for _, mobileAnime := range animes {
		if mobileAnime.Activo != 1 {
			continue
		}
		if weekdays := weekdayPlacements(mobileAnime.Dias); len(weekdays) > 0 {
			for _, day := range weekdays {
				board.Grid = append(board.Grid, OrderingCardDTO{
					AnimeID:    mobileAnime.ID,
					Name:       mobileAnime.Nombre,
					Dia:        day.Dia,
					Orden:      day.Orden,
					IsNewcomer: approved[mobileAnime.ID],
				})
			}
			continue
		}
		if approved[mobileAnime.ID] {
			section, order := "", 0
			if len(mobileAnime.Dias) > 0 {
				section, order = mobileAnime.Dias[0].Dia, mobileAnime.Dias[0].Orden
			}
			board.Rail = append(board.Rail, OrderingCardDTO{
				AnimeID:    mobileAnime.ID,
				Name:       mobileAnime.Nombre,
				Section:    section,
				Orden:      order,
				IsNewcomer: true,
			})
		}
	}
}

// weekdayPlacements returns every weekday dias entry (an anime may air on more than
// one day — Legacy multi-day ordering), skipping Estrenos-section entries.
func weekdayPlacements(dias []contracts.MobileAnimeDay) []contracts.MobileAnimeDay {
	out := make([]contracts.MobileAnimeDay, 0, len(dias))
	for _, day := range dias {
		if _, ok := seasonWeekdays[day.Dia]; ok {
			out = append(out, day)
		}
	}
	return out
}
