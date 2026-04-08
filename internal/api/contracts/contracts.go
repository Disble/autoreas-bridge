package contracts

import (
	"context"
	"errors"
)

var ErrAnimeNotFound = errors.New("anime not found")

type AnimePatch struct {
	Estado      *int     `json:"estado,omitempty"`
	NroCapVisto *float64 `json:"nrocapvisto,omitempty"`
	Dias        []string `json:"dias,omitempty"`
}

type EffectiveAnime struct {
	ID           string
	TotalCap     *float64
	Activo       *bool
	SnapshotJSON []byte
}

type AnimeQueryService interface {
	GetEffectiveAnime(ctx context.Context, id string) (*EffectiveAnime, error)
}

type AnimeWriteService interface {
	PatchAnime(ctx context.Context, id string, patch AnimePatch) error
}

type SyncTriggerService interface {
	TriggerReconcile(ctx context.Context) error
}
