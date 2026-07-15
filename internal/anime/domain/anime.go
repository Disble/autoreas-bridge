package domain

import "time"

type TriState int

const (
	TriStateAbsent TriState = iota
	TriStateFalse
	TriStateTrue
)

type AnimeDay struct {
	Day   string
	Order float64
}

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

func (a *Anime) SetProgress(value float64) {
	a.Progress = value
	a.changes.Progress = true
}

func (a *Anime) SetStatus(value int) {
	a.Status = &value
	a.changes.Status = true
}

func (a *Anime) SetDays(days []AnimeDay) {
	a.Days = append([]AnimeDay(nil), days...)
	a.changes.Days = true
}

func (a *Anime) SetActive(value bool) {
	if value {
		a.Active = TriStateTrue
	} else {
		a.Active = TriStateFalse
	}
	a.changes.Active = true
}

func (a *Anime) SetPremieredAt(value *time.Time) {
	a.PremieredAt = cloneTime(value)
	a.changes.PremieredAt = true
}

func (a *Anime) SetLastWatchedAt(value *time.Time) {
	a.LastWatchedAt = cloneTime(value)
	a.changes.LastWatchedAt = true
}

func (a *Anime) SetDeletedAt(value *time.Time) {
	a.DeletedAt = cloneTime(value)
	a.changes.DeletedAt = true
}

func (a *Anime) Deactivate(at time.Time) {
	a.Active = TriStateFalse
	a.DeletedAt = timePointer(at.UTC())
	a.changes.Active = true
	a.changes.DeletedAt = true
}

func (a Anime) Changes() AnimeChanges {
	return a.changes
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := value.UTC()
	return &cloned
}
