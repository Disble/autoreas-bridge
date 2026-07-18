package season

import (
	"context"
	"strings"

	"autoreas-bridge/internal/season/domain"
)

type intakeBuckets struct {
	createdKeys map[string]struct{}
	editable    map[string]domain.SeasonAnime
	discarded   map[string]domain.SeasonAnime
}

// ReconcileIntake sets the season's UNCREATED intake to exactly the given
// plain-text names (the raw editor's source of truth): names not present are
// added as pending, editable rows no longer present are discarded, and a
// removed-then-readded name revives its discarded row (no duplicate). CREATED
// rows are never touched — a created anime has a real record that can only be
// removed by an explicit "remove from season", never by a stray text edit.
func (s *Service) ReconcileIntake(ctx context.Context, seasonID, rawText string) error {
	desired := desiredIntakeNames(rawText)
	rows, err := s.repo.ListSeasonAnimes(ctx, seasonID)
	if err != nil {
		return err
	}
	buckets := bucketSeasonIntakeRows(rows)
	if err := s.discardRemovedIntakeRows(ctx, desired, buckets.editable); err != nil {
		return err
	}
	return s.restoreOrCreateDesiredIntakeRows(ctx, seasonID, desired, buckets)
}

// desiredIntakeNames parses desired intake names from source text.
func desiredIntakeNames(rawText string) map[string]string {
	desired := make(map[string]string)
	for _, name := range parseIntakeNames(rawText) {
		desired[strings.ToLower(name)] = name
	}
	return desired
}

// bucketSeasonIntakeRows groups intake rows by lifecycle state.
func bucketSeasonIntakeRows(rows []domain.SeasonAnime) intakeBuckets {
	buckets := intakeBuckets{
		createdKeys: make(map[string]struct{}),
		editable:    make(map[string]domain.SeasonAnime),
		discarded:   make(map[string]domain.SeasonAnime),
	}
	for _, row := range rows {
		key := strings.ToLower(strings.TrimSpace(row.RawName))
		switch {
		case row.Availability == domain.AvailabilityCreated:
			buckets.createdKeys[key] = struct{}{}
		case row.MatchStatus == domain.MatchDiscarded:
			buckets.discarded[key] = row
		default:
			buckets.editable[key] = row
		}
	}
	return buckets
}

// discardRemovedIntakeRows discards editable rows absent from the desired intake.
func (s *Service) discardRemovedIntakeRows(ctx context.Context, desired map[string]string, editable map[string]domain.SeasonAnime) error {
	for key, row := range editable {
		if _, want := desired[key]; want {
			continue
		}
		row.MatchStatus = domain.MatchDiscarded
		if err := s.repo.UpdateSeasonAnime(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

// restoreOrCreateDesiredIntakeRows restores or creates desired intake rows.
func (s *Service) restoreOrCreateDesiredIntakeRows(ctx context.Context, seasonID string, desired map[string]string, buckets intakeBuckets) error {
	for key, name := range desired {
		if _, isCreated := buckets.createdKeys[key]; isCreated {
			continue
		}
		if _, isEditable := buckets.editable[key]; isEditable {
			continue
		}
		if row, wasDiscarded := buckets.discarded[key]; wasDiscarded {
			if err := s.reviveDiscardedSeasonAnime(ctx, row); err != nil {
				return err
			}
			continue
		}
		if err := s.repo.CreateSeasonAnime(ctx, domain.NewSeasonAnime(s.newID(), seasonID, name, s.now())); err != nil {
			return err
		}
	}
	return nil
}

// reviveDiscardedSeasonAnime restores a previously discarded season anime.
func (s *Service) reviveDiscardedSeasonAnime(ctx context.Context, row domain.SeasonAnime) error {
	row.MatchStatus = domain.MatchPending
	row.MatchedSlug = ""
	row.Candidates = nil
	return s.repo.UpdateSeasonAnime(ctx, row)
}
