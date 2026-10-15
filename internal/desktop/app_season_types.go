package desktop

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

// SeasonAnimeMetadataCoverDTO is the canonical typed cover ({type, path}) stored
// with a confirmed lookup, the same shape the anime create contract uses.
type SeasonAnimeMetadataCoverDTO struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

// SeasonAnimeMetadataDTO is the confirmed MyAnimeList metadata stored for one
// intake row, in the canonical anime create vocabulary (the same json names
// internal/season.AnimeCreateMetadata uses). It is a typed projection on
// purpose: the raw stored JSON never crosses the Wails boundary, and Wails does
// not register a map[string]Struct value type in its generated models. Every
// member is optional — an absent value means the user confirmed nothing there.
// There is deliberately no name: the anime's name is the row's raw name, and a
// confirmed MyAnimeList title must never rename it.
type SeasonAnimeMetadataDTO struct {
	Kind            *int                         `json:"kind,omitempty"`
	TotalEpisodes   *int                         `json:"totalEpisodes,omitempty"`
	DurationMinutes *int                         `json:"durationMinutes,omitempty"`
	Origin          string                       `json:"origin,omitempty"`
	Genres          []string                     `json:"genres,omitempty"`
	Studios         []string                     `json:"studios,omitempty"`
	Cover           *SeasonAnimeMetadataCoverDTO `json:"cover,omitempty"`
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
	// Metadata is the confirmed MyAnimeList lookup stored for this row, or nil
	// when none was recorded (or its stored payload could not be read).
	Metadata *SeasonAnimeMetadataDTO `json:"metadata,omitempty"`
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

// seasonClosureSnapshotDTO is the persisted shape of the ordering board captured
// at the moment a season closes (P3), stored verbatim in seasons.closure_json.
// The rail and grid reuse OrderingCardDTO so the payload round-trips into the
// same read model, and every grid card carries the dia+orden actually scheduled.
// DailyBoard is the Daily board at close (T4c), always written as a non-nil
// array; a payload stored before it existed decodes it as nil (not recorded).
type seasonClosureSnapshotDTO struct {
	CapturedAt int64                      `json:"capturedAt"`
	AppliedAt  *int64                     `json:"appliedAt"`
	Rail       []OrderingCardDTO          `json:"rail"`
	Grid       []OrderingCardDTO          `json:"grid"`
	DailyBoard []SeasonDailyBoardEntryDTO `json:"dailyBoard"`
}

// SeasonDailyBoardEntryDTO is one created season anime on the Daily board when
// its season closed: the season row and anime it is, its daily section ("Sin
// ver", "Ver hoy" or "Visto", Spanish data literals) and its 1-based order
// within that section, in the board's row order.
type SeasonDailyBoardEntryDTO struct {
	RowID   string `json:"rowId"`
	AnimeID string `json:"animeId"`
	Section string `json:"section"`
	Order   int    `json:"order"`
}

// SeasonDailyBoardSnapshotDTO is the read-only history read of the Daily board
// a season had when it closed. Recorded is false when the season closed before
// the board was captured; Entries is then empty. Entries is never nil.
type SeasonDailyBoardSnapshotDTO struct {
	Recorded bool                       `json:"recorded"`
	Entries  []SeasonDailyBoardEntryDTO `json:"entries"`
}

// SeasonOrderingSnapshotDTO is the read-only history read of the ordering board
// a season actually had when it closed, decoded from the payload stored at close
// time (P3). Recorded is the explicit "a board was captured" state: when it is
// false the season closed before snapshots existed, or its payload was empty or
// unreadable, and the collections are empty with null timestamps — never a live
// or reconstructed board. Rail and Grid are always non-nil so the frontend never
// receives null collections. DailyBoard is the Daily board decoded from the same
// closure payload, with its own recorded state: a board captured before the
// Daily board was recorded still reports Recorded=true here.
type SeasonOrderingSnapshotDTO struct {
	Recorded   bool                        `json:"recorded"`
	CapturedAt *int64                      `json:"capturedAt"`
	AppliedAt  *int64                      `json:"appliedAt"`
	Rail       []OrderingCardDTO           `json:"rail"`
	Grid       []OrderingCardDTO           `json:"grid"`
	DailyBoard SeasonDailyBoardSnapshotDTO `json:"dailyBoard"`
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

// SeasonProviderPageDTO is one anime page a download provider returned for
// the intake's manual "Find on provider" search, tagged with that provider's
// name (its site descriptor name, e.g. "jkanime").
type SeasonProviderPageDTO struct {
	Title    string `json:"title"`
	PageURL  string `json:"pageUrl"`
	Provider string `json:"provider"`
}

// SeasonProviderSearchDTO is the Wails-facing result of a provider search:
// Status is "ok" or an error message, and Pages is every page the providers
// returned, ranked by similarity to the query. Pages is never nil.
type SeasonProviderSearchDTO struct {
	Status string                  `json:"status"`
	Pages  []SeasonProviderPageDTO `json:"pages"`
}
