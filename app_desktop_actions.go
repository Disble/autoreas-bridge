package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/activity"
	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

func (a *App) OpenAnimePage(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, anime.ActivityActionAnimePageOpened, pageValue, func(ctx context.Context, value string) error {
		if err := anime.ValidatePageURL(value); err != nil {
			return err
		}
		a.ensureRuntimeDependencies()
		a.openURL(ctx, value)
		return nil
	})
}

func (a *App) CopyAnimePage(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, anime.ActivityActionAnimePageCopied, pageValue, func(ctx context.Context, value string) error {
		a.ensureRuntimeDependencies()
		return a.copyText(ctx, value)
	})
}

func (a *App) OpenAnimeFolder(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, anime.ActivityActionAnimeFolderOpened, folderValue, func(_ context.Context, value string) error {
		if err := anime.ValidateLocalFolder(value); err != nil {
			return err
		}
		a.ensureRuntimeDependencies()
		return a.openFolder(value)
	})
}

func (a *App) CopyAnimeFolder(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, anime.ActivityActionAnimeFolderCopied, folderValue, func(ctx context.Context, value string) error {
		a.ensureRuntimeDependencies()
		return a.copyText(ctx, value)
	})
}

// runAnimeDesktopAction executes a desktop action and records its activity.
func (a *App) runAnimeDesktopAction(
	animeID string,
	actionType string,
	valueFn func(contracts.MobileAnime) *string,
	run func(context.Context, string) error,
) contracts.EpisodeCommandResult {
	if a.animeQuery == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: "anime query service unavailable"}
	}

	current, err := a.animeQuery.GetMobileAnime(a.appContext(), animeID)
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}

	value := valueFn(*current)
	if value == nil || strings.TrimSpace(*value) == "" {
		return contracts.EpisodeCommandResult{Status: "error", Message: "anime action value unavailable", AnimeID: animeID, AnimeName: current.Name}
	}

	if err := run(a.appContext(), *value); err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error(), AnimeID: animeID, AnimeName: current.Name}
	}

	occurredAtMs := time.Now().UnixMilli()
	if err := a.recordDesktopAnimeAction(*current, actionType, occurredAtMs); err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error(), AnimeID: animeID, AnimeName: current.Name}
	}

	return contracts.EpisodeCommandResult{
		Status:          "ok",
		AnimeID:         animeID,
		AnimeName:       current.Name,
		AnimeStatus:     current.Status,
		EpisodesWatched: current.EpisodesWatched,
		OccurredAtMs:    occurredAtMs,
		CorrelationID:   fmt.Sprintf("anime.desktop-action:%s:%d", animeID, occurredAtMs),
	}
}

// recordDesktopAnimeAction persists a desktop action for the current anime.
func (a *App) recordDesktopAnimeAction(current contracts.MobileAnime, actionType string, occurredAtMs int64) error {
	if a.bridgeDB == nil {
		return nil
	}
	recorder := activityRecorderAdapter{store: activity.NewStore(activity.NewSQLiteProvider(a.bridgeDB))}
	snapshot := anime.ActivityAnimeSnapshot{
		Estado:      current.Status,
		NroCapVisto: current.EpisodesWatched,
		Activo:      current.Active,
	}
	return recorder.RecordActivity(a.appContext(), anime.ActivityRecord{
		Source:        anime.ActivitySourceDesktop,
		ActionType:    actionType,
		AnimeID:       current.ID,
		AnimeName:     current.Name,
		OccurredAtMs:  occurredAtMs,
		CorrelationID: fmt.Sprintf("anime.desktop-action:%s:%d", current.ID, occurredAtMs),
		Before:        snapshot,
		After:         snapshot,
	})
}

// pageValue returns the stored anime page URL.
func pageValue(item contracts.MobileAnime) *string {
	return item.SourceURL
}

// folderValue returns the stored anime folder path.
func folderValue(item contracts.MobileAnime) *string {
	return item.Folder
}
