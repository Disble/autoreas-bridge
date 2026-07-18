package domain

import "time"

// TriState preserves legacy true/false/absent boolean semantics.
type TriState int

const (
	// TriStateAbsent preserves an omitted legacy boolean field.
	TriStateAbsent TriState = iota
	// TriStateFalse preserves an explicit false legacy boolean field.
	TriStateFalse
	// TriStateTrue preserves an explicit true legacy boolean field.
	TriStateTrue
)

// AnimeDay is one ordered legacy weekday placement.
type AnimeDay struct {
	Day   string
	Order float64
}

// Repetition snapshots one completed watch cycle before a repeat reset.
type Repetition struct {
	Number        int
	Progress      float64
	Status        int
	CreatedAt     *time.Time
	PremieredAt   *time.Time
	LastWatchedAt *time.Time
	DeletedAt     *time.Time
	RepeatedAt    time.Time
}

// AnimeChanges tracks which mutable anime fields changed in the current command.
type AnimeChanges struct {
	Progress      bool
	Status        bool
	Days          bool
	Active        bool
	FirstCycle    bool
	CreatedAt     bool
	PremieredAt   bool
	LastWatchedAt bool
	DeletedAt     bool
	Repetition    *Repetition
}

// Anime is the write-side bridge aggregate for one legacy anime record.
type Anime struct {
	ID              string
	Title           string
	Progress        float64
	Status          *int
	Days            []AnimeDay
	Active          TriState
	FirstCycle      TriState
	CreatedAt       *time.Time
	PremieredAt     *time.Time
	LastWatchedAt   *time.Time
	DeletedAt       *time.Time
	TotalEpisodes   *float64
	DurationMinutes *float64
	SourceURL       *string
	ContentType     *int
	Folder          *string
	Origin          *string
	Studios         []string
	Genres          []string
	CoverPath       *string
	Repetitions     []Repetition

	changes AnimeChanges
}

// Repeat archives the current cycle and resets the anime to a fresh watch cycle.
func (a *Anime) Repeat(at time.Time) {
	status := 0
	if a.Status != nil {
		status = *a.Status
	}

	a.changes.Repetition = &Repetition{
		Progress:      a.Progress,
		Status:        status,
		CreatedAt:     a.CreatedAt,
		PremieredAt:   a.PremieredAt,
		LastWatchedAt: a.LastWatchedAt,
		DeletedAt:     a.DeletedAt,
		RepeatedAt:    at.UTC(),
	}

	watching := 0
	a.Progress = 0
	a.Status = &watching
	a.Active = TriStateTrue
	if a.FirstCycle == TriStateTrue {
		a.FirstCycle = TriStateFalse
		a.changes.FirstCycle = true
	}
	a.CreatedAt = timePointer(at.UTC())
	a.PremieredAt = nil
	a.LastWatchedAt = nil
	a.DeletedAt = nil
	a.changes.Progress = true
	a.changes.Status = true
	a.changes.Active = true
	a.changes.CreatedAt = true
	a.changes.PremieredAt = true
	a.changes.LastWatchedAt = true
	a.changes.DeletedAt = true
}

// Restore reactivates a previously deleted anime.
func (a *Anime) Restore() {
	if a.Active != TriStateTrue {
		a.Active = TriStateTrue
		a.changes.Active = true
	}
	if a.DeletedAt != nil {
		a.DeletedAt = nil
		a.changes.DeletedAt = true
	}
}

// SetProgress overwrites watched progress and marks it dirty.
func (a *Anime) SetProgress(value float64) {
	a.Progress = value
	a.changes.Progress = true
}

// SetStatus overwrites estado and marks it dirty.
func (a *Anime) SetStatus(value int) {
	a.Status = &value
	a.changes.Status = true
}

// SetDays overwrites weekday placements and marks them dirty.
func (a *Anime) SetDays(days []AnimeDay) {
	a.Days = append([]AnimeDay(nil), days...)
	a.changes.Days = true
}

// SetActive overwrites the active tri-state from a boolean command input.
func (a *Anime) SetActive(value bool) {
	if value {
		a.Active = TriStateTrue
	} else {
		a.Active = TriStateFalse
	}
	a.changes.Active = true
}

// SetPremieredAt overwrites the premiered date and marks it dirty.
func (a *Anime) SetPremieredAt(value *time.Time) {
	a.PremieredAt = cloneTime(value)
	a.changes.PremieredAt = true
}

// SetLastWatchedAt overwrites the last-watched date and marks it dirty.
func (a *Anime) SetLastWatchedAt(value *time.Time) {
	a.LastWatchedAt = cloneTime(value)
	a.changes.LastWatchedAt = true
}

// SetDeletedAt overwrites the deleted date and marks it dirty.
func (a *Anime) SetDeletedAt(value *time.Time) {
	a.DeletedAt = cloneTime(value)
	a.changes.DeletedAt = true
}

// Deactivate marks the anime inactive and records the deletion timestamp.
func (a *Anime) Deactivate(at time.Time) {
	a.Active = TriStateFalse
	a.DeletedAt = timePointer(at.UTC())
	a.changes.Active = true
	a.changes.DeletedAt = true
}

// Changes returns the accumulated field-dirty markers for the aggregate.
func (a Anime) Changes() AnimeChanges {
	return a.changes
}

// timePointer returns a pointer to the supplied time value.
func timePointer(value time.Time) *time.Time {
	return &value
}

// cloneTime returns a UTC copy of the supplied time pointer.
func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := value.UTC()
	return &cloned
}
