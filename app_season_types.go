package main

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

// SeasonAnimeCandidateDTO is one ranked match option for an ambiguous intake row.
type SeasonAnimeCandidateDTO struct {
	Title   string  `json:"title"`
	PageURL string  `json:"pageUrl"`
	Score   float64 `json:"score"`
}

// SeasonAnimeDTO is the Wails-facing projection of one intake/matching row.
// Section is the created anime's current Estrenos section (Sin ver / Ver hoy /
// Visto) or weekday once its schedule is applied, empty for uncreated rows;
// SectionOrder is its orden within that section (0 when unknown). Grade/GradeSource/RatedAt/SkipGrading carry
// the SDD-44 first-episode grade (grade 0 = ungraded, ratedAt null until graded).
// FolderPath/PageURL are the created anime's desktop-action targets (download
// folder, source page), empty for uncreated rows. This DTO is Wails-only (never
// exposed over REST/openapi.yaml), so these additive fields have no OpenAPI
// schema counterpart.
type SeasonAnimeDTO struct {
	ID                string                    `json:"id"`
	RawName           string                    `json:"rawName"`
	MatchStatus       string                    `json:"matchStatus"`
	MatchedSlug       string                    `json:"matchedSlug"`
	Candidates        []SeasonAnimeCandidateDTO `json:"candidates"`
	Availability      string                    `json:"availability"`
	AvailableEpisodes int                       `json:"availableEpisodes"`
	AnimeID           string                    `json:"animeId"`
	Section           string                    `json:"section"`
	SectionOrder      int                       `json:"sectionOrder"`
	Grade             int                       `json:"grade"`
	GradeSource       string                    `json:"gradeSource"`
	RatedAt           *int64                    `json:"ratedAt"`
	SkipGrading       bool                      `json:"skipGrading"`
	Consideration     string                    `json:"consideration"`
	FolderPath        string                    `json:"folderPath"`
	PageURL           string                    `json:"pageUrl"`
}

// ApplyScheduleDTO is the Wails-facing result of applying the ordering schedule.
type ApplyScheduleDTO struct {
	Status  string   `json:"status"`
	Applied int      `json:"applied"`
	Failed  []string `json:"failed"`
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

// ConfirmSelectionDTO is the Wails-facing result of confirming the selection:
// "ok" or an error message, the approved/rejected counts, and a quota-overflow
// flag so the UI can surface the one hard rule distinctly.
type ConfirmSelectionDTO struct {
	Status        string `json:"status"`
	Approved      int    `json:"approved"`
	Rejected      int    `json:"rejected"`
	QuotaExceeded bool   `json:"quotaExceeded"`
}
