package season

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/season/domain"
)

// signalRepo is a Repository whose writes fail with err; reads return nothing.
type signalRepo struct {
	Repository
	err error
}

// CreateSeason returns the configured write error.
func (r signalRepo) CreateSeason(context.Context, domain.Season) error { return r.err }

// UpdateSeason returns the configured write error.
func (r signalRepo) UpdateSeason(context.Context, domain.Season) error { return r.err }

// CreateSeasonAnime returns the configured write error.
func (r signalRepo) CreateSeasonAnime(context.Context, domain.SeasonAnime) error { return r.err }

// UpdateSeasonAnime returns the configured write error.
func (r signalRepo) UpdateSeasonAnime(context.Context, domain.SeasonAnime) error { return r.err }

// ActiveSeason reads nothing.
func (r signalRepo) ActiveSeason(context.Context) (*domain.Season, error) { return nil, nil }

// ListSeasonAnimes reads nothing.
func (r signalRepo) ListSeasonAnimes(context.Context, string) ([]domain.SeasonAnime, error) {
	return nil, nil
}

// TestWithProjectionSignalSignalsEverySuccessfulWriteOnly checks reads never
// signal, and each write signals once when it succeeds and never when it fails.
func TestWithProjectionSignalSignalsEverySuccessfulWriteOnly(t *testing.T) {
	ctx := context.Background()
	readBus := events.NewBus()
	readSignals := 0
	readBus.Subscribe(events.EventNameSeasonProjectionChanged, func(events.Event) { readSignals++ })
	reader := WithProjectionSignal(signalRepo{}, readBus)
	_, _ = reader.ActiveSeason(ctx)
	_, _ = reader.ListSeasonAnimes(ctx, "s1")
	if readSignals != 0 {
		t.Fatalf("reads signalled %d times", readSignals)
	}

	writes := map[string]func(Repository) error{
		"CreateSeason":      func(r Repository) error { return r.CreateSeason(ctx, domain.Season{}) },
		"UpdateSeason":      func(r Repository) error { return r.UpdateSeason(ctx, domain.Season{}) },
		"CreateSeasonAnime": func(r Repository) error { return r.CreateSeasonAnime(ctx, domain.SeasonAnime{}) },
		"UpdateSeasonAnime": func(r Repository) error { return r.UpdateSeasonAnime(ctx, domain.SeasonAnime{}) },
	}
	for name, write := range writes {
		for _, writeErr := range []error{nil, errors.New("disk full")} {
			bus := events.NewBus()
			signals := 0
			bus.Subscribe(events.EventNameSeasonProjectionChanged, func(events.Event) { signals++ })
			repo := WithProjectionSignal(signalRepo{err: writeErr}, bus)

			if err := write(repo); !errors.Is(err, writeErr) {
				t.Fatalf("%s returned %v, want %v", name, err, writeErr)
			}

			want := 1
			if writeErr != nil {
				want = 0
			}
			if signals != want {
				t.Fatalf("%s with error %v signalled %d times, want %d", name, writeErr, signals, want)
			}
		}
	}
}

func TestWithProjectionSignalWithoutABusKeepsTheRepository(t *testing.T) {
	repo := signalRepo{}
	if got := WithProjectionSignal(repo, nil); got != Repository(repo) {
		t.Fatalf("nil bus wrapped the repository: %T", got)
	}
}
