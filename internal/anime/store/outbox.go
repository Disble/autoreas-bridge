package store

import (
	"context"
	"fmt"
)

// AnimeChangedOutboxEvent is one durable pending anime.changed publication.
type AnimeChangedOutboxEvent struct {
	EventID     string
	OperationID string
	AnimeID     string
	Payload     []byte
	CreatedAtMs int64
}

// AnimeChangedOutboxStore persists pending anime.changed publications.
type AnimeChangedOutboxStore interface {
	ListPendingAnimeChanged(context.Context) ([]AnimeChangedOutboxEvent, error)
	MarkAnimeChangedPublished(context.Context, string, int64) error
}

// DrainOutbox publishes pending committed writes with stable event identities.
// Delivery is at-least-once because the durable row is marked only after the
// synchronous in-memory publish returns.
func (g *Gateway) DrainOutbox(ctx context.Context) error {
	if g.config.Outbox == nil {
		return fmt.Errorf("anime.changed outbox store is required")
	}
	if g.config.PublishChanged == nil {
		return fmt.Errorf("anime.changed publisher is required")
	}
	pending, err := g.config.Outbox.ListPendingAnimeChanged(ctx)
	if err != nil {
		return fmt.Errorf("list pending anime.changed outbox: %w", err)
	}
	for _, event := range pending {
		g.config.PublishChanged(event.EventID, event.AnimeID, append([]byte(nil), event.Payload...))
		markCtx, cancel := context.WithTimeout(context.Background(), writeCleanupTimeout)
		err := g.config.Outbox.MarkAnimeChangedPublished(markCtx, event.EventID, g.config.Now().UnixMilli())
		cancel()
		if err != nil {
			return fmt.Errorf("mark anime.changed event %q published: %w", event.EventID, err)
		}
	}
	return nil
}
