package season

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"autoreas-bridge/internal/season/domain"
)

func newOrderingService(repo *fakeRepo) (*Service, *fakeGateway) {
	svc := newTestService(repo)
	gw := &fakeGateway{}
	svc.SetAvailabilityDeps(&fakeProbe{}, gw)
	return svc, gw
}

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

func TestApplySchedulePartialFailureDoesNotStamp(t *testing.T) {
	repo := newFakeRepo()
	svc, gw := newOrderingService(repo)
	ctx := context.Background()
	_, _ = svc.CreateSeason(ctx, "Julio 2026")

	gw.placements = map[string][]domain.Placement{
		"anime-a": {{Dia: "Visto", Orden: 1}},
		"anime-b": {{Dia: "Visto", Orden: 2}},
	}
	gw.failSchedule = map[string]bool{"anime-b": true}
	raw := draftJSON(t, map[string][]domain.Placement{
		"anime-a": {{Dia: "Lunes", Orden: 1}},
		"anime-b": {{Dia: "Lunes", Orden: 2}},
	})
	_ = svc.SaveOrderingDraft(ctx, raw)

	res, err := svc.ApplySchedule(ctx)
	if err != nil {
		t.Fatalf("ApplySchedule: %v", err)
	}
	if res.Applied != 1 || len(res.Failed) != 1 || res.Failed[0] != "anime-b" {
		t.Fatalf("expected 1 applied, anime-b failed, got %+v", res)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.AppliedAt != nil {
		t.Fatal("a partial failure must NOT stamp the applied milestone")
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
