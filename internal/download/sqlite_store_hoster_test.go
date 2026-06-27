package download

import (
	"context"
	"testing"
)

func TestSQLiteStoreSeedsHosterPriorityOnlyWhenEmpty(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	seed := []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}, {Hoster: "Mega", Priority: 1, Enabled: true}}
	if err := store.SeedHosterPriorityIfEmpty(ctx, "jkanime", seed); err != nil {
		t.Fatalf("seed: %v", err)
	}
	got, err := store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 seeded rows, got %d", len(got))
	}
	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{{Hoster: "Mega", Priority: 0, Enabled: true}, {Hoster: "Mediafire", Priority: 1, Enabled: true}}); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := store.SeedHosterPriorityIfEmpty(ctx, "jkanime", seed); err != nil {
		t.Fatalf("re-seed: %v", err)
	}
	got, err = store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list after re-seed: %v", err)
	}
	if len(got) != 2 || got[0].Hoster != "Mega" || got[0].Priority != 0 {
		t.Fatalf("expected user ordering preserved (Mega first), got %#v", got)
	}
}

func TestSQLiteStoreSetHosterPriorityReplacesExistingOrdering(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	ctx := context.Background()
	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{{Hoster: "Mediafire", Priority: 0, Enabled: true}}); err != nil {
		t.Fatalf("first set: %v", err)
	}
	if err := store.SetHosterPriority(ctx, "jkanime", []HosterPriorityEntry{{Hoster: "Mega", Priority: 0, Enabled: true}, {Hoster: "Mediafire", Priority: 1, Enabled: false}}); err != nil {
		t.Fatalf("second set: %v", err)
	}
	got, err := store.ListHosterPriority(ctx, "jkanime")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected exactly 2 rows after replace, got %d (%#v)", len(got), got)
	}
}

func TestSQLiteStoreListHosterPriorityIsEmptyForUnknownSite(t *testing.T) {
	t.Parallel()
	db := openTestBridgeDB(t)
	store := NewSQLiteStore(db)
	got, err := store.ListHosterPriority(context.Background(), "unknown-site")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected 0 rows for an unconfigured site, got %d", len(got))
	}
}
