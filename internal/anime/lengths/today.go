package lengths

import (
	"context"

	"autoreas-bridge/internal/anime/episodes"
)

// Reader loads the stored durations of several anime in one read. The episodes store implements it.
type Reader interface {
	ByAnimeIDs(ctx context.Context, animeIDs []string) (map[string][]episodes.Duration, error)
}

// Request is what Today knows about one anime of the day: its id, its stored type, and the progress
// the schedule already carries.
type Request struct {
	AnimeID  string
	Kind     *int
	Progress float64
}

// Today is the Today adapter: it answers the marks of a day from stored durations only. Opening Today
// never reads a folder, runs the identity decision or starts ffprobe (analysis D7).
type Today struct {
	reader Reader
}

// NewToday returns the Today adapter reading from reader.
func NewToday(reader Reader) *Today {
	return &Today{reader: reader}
}

// TodayMarks answers one mark per request, in the same order: a mark when that anime's next episode
// runs long, nil when it does not.
//
// The whole day is read in one query. A failed read leaves every row unmarked, which is the same
// degradation as an unwired adapter: a mark is a hint, and its absence must never fail the schedule.
func (t *Today) TodayMarks(ctx context.Context, requests []Request) []*Mark {
	marks := make([]*Mark, len(requests))
	if len(requests) == 0 {
		return marks
	}
	animeIDs := make([]string, len(requests))
	for i, request := range requests {
		animeIDs[i] = request.AnimeID
	}
	durations, err := t.reader.ByAnimeIDs(ctx, animeIDs)
	if err != nil {
		return marks
	}
	for i, request := range requests {
		marks[i] = LongNextEpisode(durations[request.AnimeID], request.Kind, request.Progress)
	}
	return marks
}
