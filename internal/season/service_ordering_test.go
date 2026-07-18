package season

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

// newOrderingService creates the service and gateway used by ordering tests.
func newOrderingService(repo *fakeRepo) (*Service, *fakeGateway) {
	svc := newTestService(repo)
	gw := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gw)
	return svc, gw
}

type scriptedOrderingGateway struct {
	fakeGateway
	scheduleCalls   []string
	scheduleResults map[string]AnimeMutationResult
	scheduleErrors  map[string]error
}

func (g *scriptedOrderingGateway) SetAnimeSchedule(_ context.Context, animeID string, dias []domain.Placement) (AnimeMutationResult, error) {
	g.scheduleCalls = append(g.scheduleCalls, animeID)
	if err := g.scheduleErrors[animeID]; err != nil {
		return AnimeMutationResult{}, err
	}
	result, ok := g.scheduleResults[animeID]
	if !ok {
		result = AnimeMutationResult{AnimeID: animeID, Outcome: AnimeMutationApplied}
	}
	if result.Outcome == AnimeMutationApplied || result.Outcome == AnimeMutationNoOp {
		if g.scheduled == nil {
			g.scheduled = map[string][]domain.Placement{}
		}
		g.scheduled[animeID] = append([]domain.Placement(nil), dias...)
	}
	return result, nil
}

// draftJSON encodes an ordering draft for a test request.
func draftJSON(t *testing.T, draft map[string][]domain.Placement) string {
	t.Helper()
	b, err := json.Marshal(draft)
	if err != nil {
		t.Fatalf("marshal draft: %v", err)
	}
	return string(b)
}

func TestSaveOrderingDraftPersists(t *testing.T) {
	repo := newFakeRepo()
	svc, _ := newOrderingService(repo)
	ctx := context.Background()
	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}

	raw := draftJSON(t, map[string][]domain.Placement{"anime-a": {{Dia: "Jueves", Orden: 2}}})
	if err := svc.SaveOrderingDraft(ctx, raw); err != nil {
		t.Fatalf("SaveOrderingDraft: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.OrderingDraft != raw {
		t.Fatalf("draft not persisted: %q", active.OrderingDraft)
	}
}

func TestApplyScheduleDiffsAndStampsApplied(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newOrderingService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")

	// Current: a in Visto/1, b already on Jueves/1.
	gw.placements = map[string][]domain.Placement{
		"anime-a": {{Dia: "Visto", Orden: 1}},
		"anime-b": {{Dia: "Jueves", Orden: 1}},
	}
	// Draft: a → Domingo/1 (changed), b → Jueves/1 (unchanged).
	raw := draftJSON(t, map[string][]domain.Placement{
		"anime-a": {{Dia: "Domingo", Orden: 1}},
		"anime-b": {{Dia: "Jueves", Orden: 1}},
	})
	if err := svc.SaveOrderingDraft(ctx, raw); err != nil {
		t.Fatalf("SaveOrderingDraft: %v", err)
	}

	res, err := svc.ApplySchedule(ctx)
	if err != nil {
		t.Fatalf("ApplySchedule: %v", err)
	}
	if res.Applied != 1 || len(res.Failed) != 0 {
		t.Fatalf("expected 1 applied 0 failed, got %+v", res)
	}
	if got := gw.scheduled["anime-a"]; len(got) != 1 || got[0] != (domain.Placement{Dia: "Domingo", Orden: 1}) {
		t.Fatalf("anime-a not scheduled to Domingo/1: %+v", got)
	}
	if _, touched := gw.scheduled["anime-b"]; touched {
		t.Fatalf("unchanged anime-b must not be written")
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt == nil {
		t.Fatal("applied milestone not stamped on a clean apply")
	}
}

func TestApplyScheduleStopsAtFirstNonSuccess(t *testing.T) {
	writeErr := errors.New("write failed")
	tests := []struct {
		name        string
		result      AnimeMutationResult
		mutationErr error
		wantErr     error
	}{
		{name: "conflict", result: AnimeMutationResult{AnimeID: "anime-b", Outcome: AnimeMutationConflict, ModifiedAt: 17, ConflictID: "conflict-b"}, wantErr: ErrAnimeMutationConflict},
		{name: "unknown outcome", result: AnimeMutationResult{AnimeID: "anime-b", Outcome: AnimeMutationOutcome("unexpected")}},
		{name: "mutation error", mutationErr: writeErr, wantErr: writeErr},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeRepo()
			gateway := &scriptedOrderingGateway{
				fakeGateway: fakeGateway{placements: map[string][]domain.Placement{
					"anime-a": {{Dia: "Visto", Orden: 1}},
					"anime-b": {{Dia: "Visto", Orden: 2}},
					"anime-c": {{Dia: "Visto", Orden: 3}},
				}},
				scheduleResults: map[string]AnimeMutationResult{
					"anime-a": {AnimeID: "anime-a", Outcome: AnimeMutationNoOp},
					"anime-b": tt.result,
				},
				scheduleErrors: map[string]error{"anime-b": tt.mutationErr},
			}
			svc := newTestService(repo)
			svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
			ctx := context.Background()
			_, _ = svc.CreateSeason(ctx, "Julio 2026")
			_ = svc.SaveOrderingDraft(ctx, draftJSON(t, map[string][]domain.Placement{
				"anime-a": {{Dia: "Lunes", Orden: 1}},
				"anime-b": {{Dia: "Lunes", Orden: 2}},
				"anime-c": {{Dia: "Lunes", Orden: 3}},
			}))

			res, err := svc.ApplySchedule(ctx)
			assertApplyScheduleFailureCase(t, tt.name, tt.wantErr, err, res, gateway, svc, ctx)
		})
	}
}

// assertApplyScheduleFailureCase verifies one rejected ordering application.
func assertApplyScheduleFailureCase(t *testing.T, name string, wantErr error, err error, res ApplyResult, gateway *scriptedOrderingGateway, svc *Service, ctx context.Context) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s to fail closed, got res=%+v", name, res)
	}
	if wantErr != nil && !errors.Is(err, wantErr) {
		t.Fatalf("expected error %v, got %v", wantErr, err)
	}
	if res.Applied != 1 || len(res.Failed) != 1 || res.Failed[0] != "anime-b" {
		t.Fatalf("expected accepted anime-a and failed anime-b, got %+v", res)
	}
	if len(gateway.scheduleCalls) != 2 || gateway.scheduleCalls[0] != "anime-a" || gateway.scheduleCalls[1] != "anime-b" {
		t.Fatalf("must stop before anime-c after %s, calls=%v", name, gateway.scheduleCalls)
	}
	if _, called := gateway.scheduled["anime-c"]; called {
		t.Fatalf("anime-c must have zero side effects after %s", name)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt != nil {
		t.Fatalf("%s must not stamp the applied milestone", name)
	}
}

func TestApplyScheduleAcceptsAppliedAndNoOp(t *testing.T) {
	for _, outcome := range []AnimeMutationOutcome{AnimeMutationApplied, AnimeMutationNoOp} {
		t.Run(string(outcome), func(t *testing.T) {
			repo := newFakeRepo()
			gateway := &scriptedOrderingGateway{
				fakeGateway: fakeGateway{placements: map[string][]domain.Placement{
					"anime-a": {{Dia: "Visto", Orden: 1}},
				}},
				scheduleResults: map[string]AnimeMutationResult{
					"anime-a": {AnimeID: "anime-a", Outcome: outcome},
				},
			}
			svc := newTestService(repo)
			svc.SetAvailabilityDeps(&fakeProbe{}, gateway)
			ctx := context.Background()
			_, _ = svc.CreateSeason(ctx, "Julio 2026")
			_ = svc.SaveOrderingDraft(ctx, draftJSON(t, map[string][]domain.Placement{
				"anime-a": {{Dia: "Lunes", Orden: 1}},
			}))

			res, err := svc.ApplySchedule(ctx)
			if err != nil {
				t.Fatalf("ApplySchedule(%s): %v", outcome, err)
			}
			if res.Applied != 1 || len(res.Failed) != 0 || len(gateway.scheduleCalls) != 1 {
				t.Fatalf("expected %s to be accepted, res=%+v calls=%v", outcome, res, gateway.scheduleCalls)
			}
			active, _ := svc.ActiveSeason(ctx)
			if active.AppliedAt == nil {
				t.Fatalf("accepted %s must stamp the applied milestone", outcome)
			}
		})
	}
}

func TestApplyScheduleRejectsDuplicateWeekdayDraft(t *testing.T) {
	t.Parallel()
	repo := newFakeRepo()
	svc, gw := newOrderingService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")

	gw.placements = map[string][]domain.Placement{
		"anime-a": {{Dia: "Visto", Orden: 1}},
	}
	raw := draftJSON(t, map[string][]domain.Placement{
		"anime-a": {{Dia: "Lunes", Orden: 1}, {Dia: "Lunes", Orden: 2}},
	})
	if err := svc.SaveOrderingDraft(ctx, raw); err != nil {
		t.Fatalf("SaveOrderingDraft: %v", err)
	}

	res, err := svc.ApplySchedule(ctx)
	if !errors.Is(err, ErrInvalidOrderingDraft) {
		t.Fatalf("expected ErrInvalidOrderingDraft, got res=%+v err=%v", res, err)
	}
	if res.Applied != 0 || len(res.Failed) != 0 {
		t.Fatalf("invalid draft must short-circuit apply, got %+v", res)
	}
	if len(gw.scheduled) != 0 {
		t.Fatalf("invalid draft must not write schedules, got %+v", gw.scheduled)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt != nil {
		t.Fatal("invalid draft must not stamp the applied milestone")
	}
	if active.OrderingDraft != raw {
		t.Fatalf("invalid draft should remain persisted for correction, got %q", active.OrderingDraft)
	}
}

func TestApplyScheduleRejectsMalformedDraft(t *testing.T) {
	t.Parallel()
	repo := newFakeRepo()
	svc, gw := newOrderingService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")

	// A draft that is not valid JSON must surface a parse error and write nothing,
	// leaving the season un-applied so the user can correct and re-apply.
	if err := svc.SaveOrderingDraft(ctx, "{ not valid json"); err != nil {
		t.Fatalf("SaveOrderingDraft: %v", err)
	}

	res, err := svc.ApplySchedule(ctx)
	if err == nil {
		t.Fatalf("expected a parse error for a malformed draft, got res=%+v", res)
	}
	if res.Applied != 0 || len(res.Failed) != 0 || len(gw.scheduled) != 0 {
		t.Fatalf("malformed draft must not write schedules, got res=%+v scheduled=%+v", res, gw.scheduled)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt != nil {
		t.Fatal("malformed draft must not stamp the applied milestone")
	}
}

func TestApplyScheduleRequiresGateway(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")
	if _, err := svc.ApplySchedule(ctx); !errors.Is(err, ErrAvailabilityDepsUnavailable) {
		t.Fatalf("expected deps error, got %v", err)
	}
}

func TestReopenOrderingClearsApplied(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newOrderingService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")
	gw.placements = map[string][]domain.Placement{"anime-a": {{Dia: "Visto", Orden: 1}}}
	_ = svc.SaveOrderingDraft(ctx, draftJSON(t, map[string][]domain.Placement{"anime-a": {{Dia: "Lunes", Orden: 1}}}))
	if _, err := svc.ApplySchedule(ctx); err != nil {
		t.Fatalf("apply: %v", err)
	}

	if err := svc.ReopenOrdering(ctx); err != nil {
		t.Fatalf("ReopenOrdering: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt != nil {
		t.Fatal("ReopenOrdering must clear the applied milestone")
	}
}
