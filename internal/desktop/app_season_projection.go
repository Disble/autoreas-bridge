package desktop

import (
	"context"

	"autoreas-bridge/internal/events"
	"autoreas-bridge/internal/logger"
	"autoreas-bridge/internal/season/domain"
	bridgeSync "autoreas-bridge/internal/sync"
)

// seasonCandidacies is the one candidate rule: a row of the open season linked to an anime is a
// candidate, carrying its grade only once graded. The changelog publication and the Mobile anime
// join both read it, so they can never disagree.
func seasonCandidacies(seasonID string, rows []domain.SeasonAnime) []bridgeSync.SeasonCandidacy {
	candidacies := make([]bridgeSync.SeasonCandidacy, 0, len(rows))
	for _, row := range rows {
		if row.AnimeID == "" {
			continue
		}
		candidacy := bridgeSync.SeasonCandidacy{AnimeID: row.AnimeID, SeasonID: seasonID}
		if row.IsGraded() {
			grade := row.Grade
			candidacy.Grade = &grade
		}
		candidacies = append(candidacies, candidacy)
	}
	return candidacies
}

// seasonProjection reads the open season's candidacies, none when no season is open. It is nil
// while the season service is unavailable, which serves Mobile anime without a season.
func (a *App) seasonProjection() bridgeSync.SeasonProjectionSource {
	if a.seasonService == nil {
		return nil
	}
	return func(ctx context.Context) ([]bridgeSync.SeasonCandidacy, error) {
		active, err := a.seasonService.ActiveSeason(ctx)
		if err != nil || active == nil {
			return nil, err
		}
		rows, err := a.seasonService.ListSeasonAnimes(ctx, active.ID)
		if err != nil {
			return nil, err
		}
		return seasonCandidacies(active.ID, rows), nil
	}
}

// startSeasonProjectionPublisher starts recording a changelog row for every candidacy change. It
// must start after the season service and the realtime hub exist; its start pass covers every
// signal sent before it subscribed.
func (a *App) startSeasonProjectionPublisher(ctx context.Context) {
	source := a.seasonProjection()
	if a.eventBus == nil || source == nil || !a.canUseBridgeDB(ctx) {
		return
	}
	// A nil *FanoutLogger must stay a nil interface, or the publisher would call through it.
	var log logger.Logger
	if a.sharedLogger != nil {
		log = a.sharedLogger
	}
	a.seasonProjectionPublisher = bridgeSync.NewSeasonProjectionPublisher(bridgeSync.SeasonProjectionPublisherConfig{
		Provider:    bridgeSync.NewSQLiteProvider(a.bridgeDB),
		Source:      source,
		OnPublished: a.announceSeasonCandidacies,
		Log:         log,
	})
	// The changelog recorder's context: shutdown cancels it first, so no row is written mid-teardown.
	a.seasonProjectionPublisher.Start(a.catchUpContext, a.eventBus)
}

// announceSeasonCandidacies tells connected phones about recorded candidacy changes with the same
// anime_changed message an edit sends, so Mobile reconciles as it already does. Like the episode
// announcement, it is never published as an AnimeChangedEvent.
func (a *App) announceSeasonCandidacies(ctx context.Context, animeIDs []string) {
	if a.realtimeHub == nil {
		return
	}
	snapshots := bridgeSync.NewAnimeSnapshotStore(a.bridgeDB)
	for _, animeID := range animeIDs {
		record, err := snapshots.GetSnapshot(ctx, animeID)
		if err != nil {
			continue
		}
		a.realtimeHub.BroadcastAnimeChanged(ctx, events.AnimeChangedEvent{
			AnimeID:       animeID,
			Payload:       record.CanonicalJSON,
			ChangeType:    events.AnimeChangeTypeUpdate,
			ChangedFields: []string{"season"},
		})
	}
}
