package anime_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

// TestWriteServiceCreateAnimeRegistersOwnershipBeforeWrite covers SDD-48
// ADR-48-3: CreateAnime must register the new id in the ownership registry
// BEFORE the durable write (register-first ordering), so a crash between
// registration and the write leaves only a harmless orphan registration,
// never a written-but-unregistered record.
func TestWriteServiceCreateAnimeRegistersOwnershipBeforeWrite(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &stubAnimeWriter{}
	registry := &stubOwnershipRegistry{}
	service := anime.NewWriteService(store, writer)
	service.SetIDGen(func() string { return "owned-anime-1" })
	service.SetDeps(anime.WriteServiceDeps{Ownership: registry})

	id, err := service.CreateAnime(ctx, api.AnimeCreate{Nombre: "Owned", Pagina: "p", Section: "Sin ver", Orden: 1})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "owned-anime-1" {
		t.Fatalf("expected generated id, got %q", id)
	}

	registered := registry.registeredIDs()
	if len(registered) != 1 || registered[0] != "owned-anime-1" {
		t.Fatalf("expected exactly one RegisterOwned call for %q, got %v", "owned-anime-1", registered)
	}
	if writer.calls != 1 {
		t.Fatalf("expected the durable write to still happen, got %d calls", writer.calls)
	}
}

// TestWriteServiceCreateAnimeFailsClosedOnRegistrationError covers ADR-48-3's
// fail-closed ordering: when RegisterOwned errors, CreateAnime MUST return
// the error WITHOUT performing the durable write and WITHOUT returning an
// id -- the create simply does not happen, avoiding a doomed
// written-but-unregistered anime.
func TestWriteServiceCreateAnimeFailsClosedOnRegistrationError(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &stubAnimeWriter{}
	registerErr := errors.New("registry unavailable")
	registry := &stubOwnershipRegistry{err: registerErr}
	service := anime.NewWriteService(store, writer)
	service.SetIDGen(func() string { return "doomed-anime" })
	service.SetDeps(anime.WriteServiceDeps{Ownership: registry})

	id, err := service.CreateAnime(ctx, api.AnimeCreate{Nombre: "Doomed", Pagina: "p", Section: "Sin ver", Orden: 1})
	if err == nil {
		t.Fatal("expected CreateAnime to fail when registration errors")
	}
	if !errors.Is(err, registerErr) {
		t.Fatalf("expected the registration error to be wrapped, got %v", err)
	}
	if id != "" {
		t.Fatalf("expected no id returned on registration failure, got %q", id)
	}
	if writer.calls != 0 {
		t.Fatalf("expected NO durable write when registration fails, got %d calls", writer.calls)
	}
}

// TestWriteServiceCreateAnimeNilOwnershipDepUnchangedBehavior is the SDD-48
// rollback guarantee: a nil WriteServiceDeps.Ownership must behave exactly
// like pre-SDD-48 CreateAnime -- the durable write still happens, with no
// registration attempted.
func TestWriteServiceCreateAnimeNilOwnershipDepUnchangedBehavior(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetIDGen(func() string { return "no-ownership-dep" })
	// SetDeps intentionally not called (zero-value WriteServiceDeps).

	id, err := service.CreateAnime(ctx, api.AnimeCreate{Nombre: "Unowned", Pagina: "p", Section: "Sin ver", Orden: 1})
	if err != nil {
		t.Fatalf("CreateAnime: %v", err)
	}
	if id != "no-ownership-dep" {
		t.Fatalf("expected generated id, got %q", id)
	}
	if writer.calls != 1 {
		t.Fatalf("expected the durable write to happen with a nil Ownership dep, got %d calls", writer.calls)
	}
}

type stubOwnershipRegistry struct {
	registered []string
	err        error
}

func (s *stubOwnershipRegistry) ListOwnedIDs(context.Context) (map[string]struct{}, error) {
	return nil, nil
}

func (s *stubOwnershipRegistry) RegisterOwned(_ context.Context, animeID string) error {
	if s.err != nil {
		return s.err
	}
	s.registered = append(s.registered, animeID)
	return nil
}

func (s *stubOwnershipRegistry) registeredIDs() []string {
	return append([]string(nil), s.registered...)
}
