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
	sequence := make([]string, 0, 2)
	writer := &stubAnimeWriter{onWrite: func() { sequence = append(sequence, "write") }}
	registry := &stubOwnershipRegistry{onRegister: func() { sequence = append(sequence, "register") }}
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
	if len(sequence) != 2 || sequence[0] != "register" || sequence[1] != "write" {
		t.Fatalf("create sequence = %v, want [register write]", sequence)
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
	assertNoPendingAnimeChanged(t, store)
}

// TestWriteServiceCreateAnimeFailsClosedWithoutOwnershipRegistry makes the
// ownership dependency mandatory for canonical creates. A missing registry is
// a configuration failure, not permission to write an unowned Legacy record.
func TestWriteServiceCreateAnimeFailsClosedWithoutOwnershipRegistry(t *testing.T) {
	ctx := context.Background()
	store := openAnimeServiceTestStore(t)
	writer := &stubAnimeWriter{}
	service := anime.NewWriteService(store, writer)
	service.SetIDGen(func() string { return "no-ownership-dep" })
	// SetDeps intentionally not called (zero-value WriteServiceDeps).

	id, err := service.CreateAnime(ctx, api.AnimeCreate{Nombre: "Unowned", Pagina: "p", Section: "Sin ver", Orden: 1})
	if err == nil {
		t.Fatal("expected CreateAnime to fail without an ownership registry")
	}
	if id != "" {
		t.Fatalf("id = %q, want empty on ownership configuration failure", id)
	}
	if writer.calls != 0 {
		t.Fatalf("Legacy writes = %d, want zero without ownership registration", writer.calls)
	}
	assertNoPendingAnimeChanged(t, store)
}

type stubOwnershipRegistry struct {
	registered []string
	err        error
	onRegister func()
}

func (s *stubOwnershipRegistry) ListOwnedIDs(context.Context) (map[string]struct{}, error) {
	return nil, nil
}

func (s *stubOwnershipRegistry) RegisterOwned(_ context.Context, animeID string) error {
	if s.err != nil {
		return s.err
	}
	if s.onRegister != nil {
		s.onRegister()
	}
	s.registered = append(s.registered, animeID)
	return nil
}

func (s *stubOwnershipRegistry) registeredIDs() []string {
	return append([]string(nil), s.registered...)
}
