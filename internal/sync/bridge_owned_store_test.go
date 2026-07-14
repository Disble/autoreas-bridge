package sync

import (
	"context"
	"testing"
)

func TestBridgeOwnedAnimeStoreRegisterOwnedAndListOwnedIDsRoundTrip(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewBridgeOwnedAnimeStore(db)
	ctx := context.Background()

	if err := store.RegisterOwned(ctx, "P7y6ZIbvbYkefA7t"); err != nil {
		t.Fatalf("RegisterOwned: %v", err)
	}

	got, err := store.ListOwnedIDs(ctx)
	if err != nil {
		t.Fatalf("ListOwnedIDs: %v", err)
	}
	if _, ok := got["P7y6ZIbvbYkefA7t"]; !ok {
		t.Fatalf("expected registered id to be present in owned set, got %v", got)
	}
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 owned id, got %d: %v", len(got), got)
	}
}

func TestBridgeOwnedAnimeStoreRegisterOwnedIsIdempotent(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewBridgeOwnedAnimeStore(db)
	ctx := context.Background()

	if err := store.RegisterOwned(ctx, "dup-id"); err != nil {
		t.Fatalf("first RegisterOwned: %v", err)
	}
	if err := store.RegisterOwned(ctx, "dup-id"); err != nil {
		t.Fatalf("second RegisterOwned (ON CONFLICT DO NOTHING) should not error: %v", err)
	}

	got, err := store.ListOwnedIDs(ctx)
	if err != nil {
		t.Fatalf("ListOwnedIDs: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected idempotent registration to leave exactly 1 owned id, got %d: %v", len(got), got)
	}
}

func TestBridgeOwnedAnimeStoreListOwnedIDsEmptyWhenNoneRegistered(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)
	store := NewBridgeOwnedAnimeStore(db)

	got, err := store.ListOwnedIDs(context.Background())
	if err != nil {
		t.Fatalf("ListOwnedIDs: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected empty owned set, got %d: %v", len(got), got)
	}
}

func TestBridgeOwnedAnimesTableCreatedByInitializeBridgeDB(t *testing.T) {
	t.Parallel()

	db := openTestBridgeDB(t)

	var name string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='bridge_owned_animes'`).Scan(&name)
	if err != nil {
		t.Fatalf("expected bridge_owned_animes table to exist after bootstrap: %v", err)
	}
	if name != "bridge_owned_animes" {
		t.Fatalf("expected table name bridge_owned_animes, got %q", name)
	}
}
