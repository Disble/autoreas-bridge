package season

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"autoreas-bridge/internal/season/domain"
)

var orderingWeekdays = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
}

// ApplyResult summarizes one ordering apply: how many anime schedules were
// written and which anime ids failed (partial failure leaves the milestone unset).
type ApplyResult struct {
	Applied int
	Failed  []string
}

// SaveOrderingDraft persists the ordering board's scratch draft (weekday-placement
// JSON) on the open season. Applied truth lives only in the animes' dias.
func (s *Service) SaveOrderingDraft(ctx context.Context, draftJSON string) error {
	return s.mutateActive(ctx, func(se *domain.Season) error {
		se.OrderingDraft = draftJSON
		return nil
	})
}

// ApplySchedule diffs the open season's draft against the animes' current dias and
// writes only the changed placements (day + explicit orden) via the gateway. Soft
// state only. On a clean apply it stamps the applied milestone. The first failed
// mutation is reported and terminates the run so no later anime can be changed;
// any earlier successful writes remain and the milestone stays unset so the user
// can re-apply (idempotent, value-equal writes no-op).
func (s *Service) ApplySchedule(ctx context.Context) (ApplyResult, error) {
	if s.gateway == nil {
		return ApplyResult{}, ErrAvailabilityDepsUnavailable
	}
	active, draft, err := s.loadScheduleDraft(ctx)
	if err != nil {
		return ApplyResult{}, err
	}
	if len(draft) == 0 {
		return ApplyResult{}, nil
	}
	current, err := s.gateway.CurrentPlacements(ctx, draftAnimeIDs(draft))
	if err != nil {
		return ApplyResult{}, err
	}

	var res ApplyResult
	for _, intent := range domain.PlanSchedule(current, draft) {
		if err := s.applyScheduleIntent(ctx, intent.AnimeID, intent.Dias, &res); err != nil {
			return res, err
		}
		res.Applied++
	}

	if len(res.Failed) == 0 {
		active.MarkApplied(s.now())
		if err := s.repo.UpdateSeason(ctx, *active); err != nil {
			return res, err
		}
	}
	return res, nil
}

// loadScheduleDraft loads the persisted season and ordering draft.
func (s *Service) loadScheduleDraft(ctx context.Context) (*domain.Season, map[string][]domain.Placement, error) {
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return nil, nil, err
	}
	if active == nil {
		return nil, nil, ErrNoActiveSeason
	}
	draft, err := parseOrderingDraft(active.OrderingDraft)
	if err != nil {
		return nil, nil, err
	}
	if hasDuplicateWeekdayPlacements(draft) {
		return nil, nil, ErrInvalidOrderingDraft
	}
	return active, draft, nil
}

// draftAnimeIDs returns the anime identifiers present in a draft.
func draftAnimeIDs(draft map[string][]domain.Placement) []string {
	ids := make([]string, 0, len(draft))
	for id := range draft {
		ids = append(ids, id)
	}
	return ids
}

// applyScheduleIntent persists one anime's requested schedule placements.
func (s *Service) applyScheduleIntent(ctx context.Context, animeID string, placements []domain.Placement, res *ApplyResult) error {
	result, err := s.gateway.SetAnimeSchedule(ctx, animeID, placements)
	if err == nil {
		err = acceptAnimeMutation(result)
	}
	if err == nil {
		return nil
	}
	res.Failed = append(res.Failed, animeID)
	return fmt.Errorf("set schedule for anime %s: %w", animeID, err)
}

// ReopenOrdering clears the applied milestone so the ordering board is editable
// again (corrections are cheap — re-apply is diff-based and idempotent).
func (s *Service) ReopenOrdering(ctx context.Context) error {
	return s.mutateActive(ctx, func(se *domain.Season) error {
		se.ReopenOrdering()
		return nil
	})
}

// parseOrderingDraft decodes an ordering draft payload.
func parseOrderingDraft(raw string) (map[string][]domain.Placement, error) {
	if strings.TrimSpace(raw) == "" {
		return map[string][]domain.Placement{}, nil
	}
	var draft map[string][]domain.Placement
	if err := json.Unmarshal([]byte(raw), &draft); err != nil {
		return nil, err
	}
	return draft, nil
}

// hasDuplicateWeekdayPlacements reports duplicate positions within weekdays.
func hasDuplicateWeekdayPlacements(draft map[string][]domain.Placement) bool {
	for _, placements := range draft {
		seen := make(map[string]struct{}, len(placements))
		for _, placement := range placements {
			if _, isWeekday := orderingWeekdays[placement.Dia]; !isWeekday {
				continue
			}
			if _, duplicated := seen[placement.Dia]; duplicated {
				return true
			}
			seen[placement.Dia] = struct{}{}
		}
	}
	return false
}
