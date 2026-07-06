package season

import (
	"context"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// fakeRepo is an in-memory Repository for service unit tests.
type fakeRepo struct {
	seasons map[string]domain.Season
	order   []string
}

func newFakeRepo() *fakeRepo { return &fakeRepo{seasons: map[string]domain.Season{}} }

func (r *fakeRepo) CreateSeason(_ context.Context, s domain.Season) error {
	if _, ok := r.seasons[s.ID]; ok {
		return errors.New("duplicate id")
	}
	r.seasons[s.ID] = s
	r.order = append(r.order, s.ID)
	return nil
}

func (r *fakeRepo) ActiveSeason(_ context.Context) (*domain.Season, error) {
	for _, id := range r.order {
		s := r.seasons[id]
		if s.Status == domain.StatusOpen {
			cp := s
			return &cp, nil
		}
	}
	return nil, nil
}

func (r *fakeRepo) UpdateSeason(_ context.Context, s domain.Season) error {
	if _, ok := r.seasons[s.ID]; !ok {
		return errors.New("not found")
	}
	r.seasons[s.ID] = s
	return nil
}

func newTestService(repo Repository) *Service {
	fixed := time.UnixMilli(1_700_000_000_000)
	n := 0
	return NewService(repo, func() time.Time { return fixed }, func() string {
		n++
		return "season-" + string(rune('0'+n))
	})
}

func TestServiceCreateSeason(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	s, err := svc.CreateSeason(ctx, "Julio 2026")
	if err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if s.Name != "Julio 2026" || s.Status != domain.StatusOpen || s.Slots != 12 || s.MinApprovalGrade != 4 {
		t.Fatalf("unexpected season: %+v", s)
	}

	active, err := svc.ActiveSeason(ctx)
	if err != nil || active == nil || active.ID != s.ID {
		t.Fatalf("ActiveSeason = %+v, err %v", active, err)
	}
}

func TestServiceCreateSeasonRejectsSecondOpen(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("first CreateSeason: %v", err)
	}
	_, err := svc.CreateSeason(ctx, "Octubre 2026")
	if !errors.Is(err, ErrSeasonAlreadyOpen) {
		t.Fatalf("expected ErrSeasonAlreadyOpen, got %v", err)
	}
}

func TestServiceSetParametersAndClose(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)
	ctx := context.Background()

	created, _ := svc.CreateSeason(ctx, "Julio 2026")

	if err := svc.SetMinApprovalGrade(ctx, 5); err != nil {
		t.Fatalf("SetMinApprovalGrade: %v", err)
	}
	if err := svc.SetSlots(ctx, 9); err != nil {
		t.Fatalf("SetSlots: %v", err)
	}
	active, _ := svc.ActiveSeason(ctx)
	if active.MinApprovalGrade != 5 || active.Slots != 9 {
		t.Fatalf("params not persisted: %+v", active)
	}

	if err := svc.CloseSeason(ctx); err != nil {
		t.Fatalf("CloseSeason: %v", err)
	}
	if after, _ := svc.ActiveSeason(ctx); after != nil {
		t.Fatalf("expected no active season after close, got %+v", after)
	}

	stored := repo.seasons[created.ID]
	if !stored.IsClosed() || stored.ClosedAt == nil {
		t.Fatalf("closed season not persisted: %+v", stored)
	}
}

func TestServiceMutationsRequireActiveSeason(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()

	if err := svc.SetSlots(ctx, 10); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
	if err := svc.CloseSeason(ctx); !errors.Is(err, ErrNoActiveSeason) {
		t.Fatalf("expected ErrNoActiveSeason, got %v", err)
	}
}

func TestServiceSetInvalidParameterRejected(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	if _, err := svc.CreateSeason(ctx, "Julio 2026"); err != nil {
		t.Fatalf("CreateSeason: %v", err)
	}
	if err := svc.SetMinApprovalGrade(ctx, 9); err == nil {
		t.Fatal("grade 9 must be rejected")
	}
}
