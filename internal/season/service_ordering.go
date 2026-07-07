package season

import (
	"context"
	"encoding/json"
	"strings"

	"autoreas-bridge/internal/season/domain"
)

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
// state only. On a clean apply it stamps the applied milestone; a partial failure
// applies what it can, reports the failed anime ids, and leaves the milestone unset
// so the user can re-apply (idempotent, value-equal writes no-op).
func (s *Service) ApplySchedule(ctx context.Context) (ApplyResult, error) {
	if s.gateway == nil {
		return ApplyResult{}, ErrAvailabilityDepsUnavailable
	}
	active, err := s.repo.ActiveSeason(ctx)
	if err != nil {
		return ApplyResult{}, err
	}
	if active == nil {
		return ApplyResult{}, ErrNoActiveSeason
	}
	draft, err := parseOrderingDraft(active.OrderingDraft)
	if err != nil {
		return ApplyResult{}, err
	}
	if len(draft) == 0 {
		return ApplyResult{}, nil
	}

	ids := make([]string, 0, len(draft))
	for id := range draft {
		ids = append(ids, id)
	}
	current, err := s.gateway.CurrentPlacements(ctx, ids)
	if err != nil {
		return ApplyResult{}, err
	}

	var res ApplyResult
	for _, intent := range domain.PlanSchedule(current, draft) {
		if err := s.gateway.SetAnimeSchedule(ctx, intent.AnimeID, intent.Dias); err != nil {
			res.Failed = append(res.Failed, intent.AnimeID)
			continue
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

// ReopenOrdering clears the applied milestone so the ordering board is editable
// again (corrections are cheap — re-apply is diff-based and idempotent).
func (s *Service) ReopenOrdering(ctx context.Context) error {
	return s.mutateActive(ctx, func(se *domain.Season) error {
		se.ReopenOrdering()
		return nil
	})
}

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
