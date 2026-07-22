package store_test

import (
	"testing"

	"autoreas-bridge/internal/anime/store"
)

func TestDecodeExposesOnlyEnglishDomainAndCanonicalBytes(t *testing.T) {
	value, canonical, err := store.Decode([]byte(`{"id":"anime-1","name":"Frieren","sourceUrl":"https://example.test/frieren"}`))
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if value.ID != "anime-1" || value.Title != "Frieren" || value.SourceURL == nil {
		t.Fatalf("Decode value = %#v, want English aggregate", value)
	}
	if len(canonical) == 0 {
		t.Fatal("Decode canonical payload is empty")
	}
}
