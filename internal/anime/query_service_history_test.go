package anime_test

import (
	"context"
	"errors"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api"
)

func TestQueryServiceGetEffectiveAnimeReturnsNotFoundForZombie(t *testing.T) {
	service := anime.NewQueryService(openAnimeServiceTestStore(t))
	_, err := service.GetEffectiveAnime(context.Background(), "zombie-1")
	if !errors.Is(err, api.ErrAnimeNotFound) {
		t.Fatalf("expected ErrAnimeNotFound, got %v", err)
	}
}
