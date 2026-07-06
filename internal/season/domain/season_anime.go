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

// NotaSource records how a grade was captured (SDD-44).
type NotaSource string

const (
	NotaSourceMobileSync NotaSource = "mobile_sync"
	NotaSourceManual     NotaSource = "manual"
)

// MatchCandidate is one ranked search option retained for an ambiguous row so
// the user can resolve it in the intake UI. Persisted as JSON.
type MatchCandidate struct {
	Title   string  `json:"title"`
	PageURL string  `json:"pageURL"`
	Score   float64 `json:"score"`
}

// SeasonAnime is one row of a season's evaluation registry. SDD-42 manages the
// intake/matching fields; availability, grade, and consideración are advanced by
// later slices (their columns exist now with defaults).
type SeasonAnime struct {
	ID           string
	SeasonID     string
	RawName      string
	MatchStatus  MatchStatus
	MatchedSlug  string
	Candidates   []MatchCandidate
	Availability Availability
	AnimeID      string
	CreatedAt    time.Time
}

// NewSeasonAnime builds a pending intake row for a raw name.
func NewSeasonAnime(id, seasonID, rawName string, now time.Time) SeasonAnime {
	return SeasonAnime{
		ID:           id,
		SeasonID:     seasonID,
		RawName:      rawName,
		MatchStatus:  MatchPending,
		Availability: AvailabilityWaiting,
		CreatedAt:    now,
	}
}
