package domain

import "time"

// MatchStatus is the intake name-resolution state of a season anime.
type MatchStatus string

const (
	MatchPending   MatchStatus = "pending"
	MatchMatched   MatchStatus = "matched"
	MatchAmbiguous MatchStatus = "ambiguous"
	MatchNotFound  MatchStatus = "not_found"
	MatchDiscarded MatchStatus = "discarded"
)

// Availability is the chapter-1 availability state (advanced by SDD-43).
type Availability string

const (
	AvailabilityWaiting   Availability = "waiting"
	AvailabilityAvailable Availability = "available"
	AvailabilityCreated   Availability = "created"
)

// GradeSource records how a grade was captured (SDD-44).
type GradeSource string

const (
	GradeSourceMobileSync GradeSource = "mobile_sync"
	GradeSourceManual     GradeSource = "manual"
)

// MatchCandidate is one ranked search option retained for an ambiguous row so
// the user can resolve it in the intake UI. Persisted as JSON.
type MatchCandidate struct {
	Title   string  `json:"title"`
	PageURL string  `json:"pageURL"`
	Score   float64 `json:"score"`
}

// SeasonAnime is one row of a season's evaluation registry. SDD-42 manages the
// intake/matching fields; availability advances in SDD-43; the first-episode
// grade (Grade) is captured in SDD-44. Consideración is advanced by SDD-45 (its
// column exists now with a default).
type SeasonAnime struct {
	ID           string
	SeasonID     string
	RawName      string
	MatchStatus  MatchStatus
	MatchedSlug  string
	Candidates   []MatchCandidate
	Availability Availability
	// AvailableChapters is how many chapters are online (SDD-43c); 0 until the
	// availability watch sees the first one. Informational — creation stays manual.
	AvailableChapters int
	AnimeID           string
	// Grade is the 1–6 first-episode grade; 0 means ungraded.
	Grade int
	// GradeSource records how Grade was captured (empty until graded).
	GradeSource GradeSource
	// RatedAt is when Grade was recorded (nil until graded).
	RatedAt *time.Time
	// SkipGrading is the explicit "no grade" override, visible at selection time.
	SkipGrading bool
	// Consideration is the selection override lever (SDD-45); defaults to none.
	Consideration Consideration
	CreatedAt     time.Time
}

// NewSeasonAnime builds a pending, ungraded intake row for a raw name.
func NewSeasonAnime(id, seasonID, rawName string, now time.Time) SeasonAnime {
	return SeasonAnime{
		ID:            id,
		SeasonID:      seasonID,
		RawName:       rawName,
		MatchStatus:   MatchPending,
		Availability:  AvailabilityWaiting,
		Consideration: ConsiderationNone,
		CreatedAt:     now,
	}
}

// ApplyGrade records a first-episode grade under the season conflict rule and
// reports whether the write was applied. A manual grade always wins and flips
// the source to manual; a mobile_sync write is REJECTED (returns false) when a
// manual grade already exists — manual is protected. A mobile write correcting
// its own earlier mobile grade is allowed. Grading clears a prior skip.
func (sa *SeasonAnime) ApplyGrade(grade int, source GradeSource, ratedAt time.Time) bool {
	if source == GradeSourceMobileSync && sa.GradeSource == GradeSourceManual && sa.IsGraded() {
		return false
	}
	sa.Grade = grade
	sa.GradeSource = source
	rated := ratedAt
	sa.RatedAt = &rated
	sa.SkipGrading = false
	return true
}

// Skip records the explicit "no grade" override for a row (recorded, visible;
// derives as not-approved at selection unless later graded).
func (sa *SeasonAnime) Skip() {
	sa.SkipGrading = true
}

// IsGraded reports whether a first-episode grade (1–6) has been recorded.
func (sa *SeasonAnime) IsGraded() bool {
	return sa.Grade >= 1
}
