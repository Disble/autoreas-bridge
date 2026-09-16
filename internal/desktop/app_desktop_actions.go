package desktop

import (
	"context"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	sharedlogger "autoreas-bridge/internal/logger"
)

// OpenAnimePage opens the anime's stored page in the default browser and
// records the activity. The stored URL is validated at this sink rather than
// trusted: a hostile value in the database must not reach the OS launcher.
func (a *App) OpenAnimePage(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, "anime.page_opened", pageValue, func(ctx context.Context, value string) error {
		if err := anime.ValidatePageURL(value); err != nil {
			return err
		}
		a.ensureRuntimeDependencies()
		a.openURL(ctx, value)
		return nil
	})
}

// CopyAnimePage copies the anime's stored page URL to the clipboard and records
// the activity. No URL validation, because the clipboard is not a launcher.
func (a *App) CopyAnimePage(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, "anime.page_copied", pageValue, func(ctx context.Context, value string) error {
		a.ensureRuntimeDependencies()
		return a.copyText(ctx, value)
	})
}

// OpenAnimeFolder opens the anime's download folder in the file manager and
// records the activity. The stored path is validated at this sink for the same
// reason as OpenAnimePage.
func (a *App) OpenAnimeFolder(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, "anime.folder_opened", folderValue, func(_ context.Context, value string) error {
		if err := anime.ValidateLocalFolder(value); err != nil {
			return err
		}
		a.ensureRuntimeDependencies()
		return a.openFolder(value)
	})
}

// CopyAnimeFolder copies the anime's download-folder path to the clipboard and
// records the activity.
func (a *App) CopyAnimeFolder(animeID string) contracts.EpisodeCommandResult {
	return a.runAnimeDesktopAction(animeID, "anime.folder_copied", folderValue, func(ctx context.Context, value string) error {
		a.ensureRuntimeDependencies()
		return a.copyText(ctx, value)
	})
}

// runAnimeDesktopAction executes a desktop action and records its telemetry
// through the shared logger. Recording is best-effort (D7): Logf never
// fails, so unlike the retired activity.Store path a recording problem can no
// longer turn a completed action into an error result.
func (a *App) runAnimeDesktopAction(
	animeID, eventType string,
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
	correlationID := fmt.Sprintf("anime.desktop-action:%s:%d", animeID, occurredAtMs)
	a.recordDesktopAnimeAction(*current, eventType, correlationID)

	return contracts.EpisodeCommandResult{
		Status:          "ok",
		AnimeID:         animeID,
		AnimeName:       current.Name,
		AnimeStatus:     current.Status,
		EpisodesWatched: current.EpisodesWatched,
		OccurredAtMs:    occurredAtMs,
		CorrelationID:   correlationID,
	}
}

// recordDesktopAnimeAction emits one desktop navigation action through the
// shared logger under domain "anime" (D7). It degrades silently when the
// shared logger is not wired, mirroring every other lazily wired App
// collaborator; metadata_json bounding/redaction happens downstream in the
// eventlog sink, not here.
func (a *App) recordDesktopAnimeAction(current contracts.MobileAnime, eventType, correlationID string) {
	if a.sharedLogger == nil {
		return
	}
	a.sharedLogger.Logf("anime", sharedlogger.LevelInfo, sharedlogger.Fields{
		EntityID:      current.ID,
		EventType:     eventType,
		CorrelationID: correlationID,
		Metadata:      map[string]any{"animeName": current.Name, "source": "desktop"},
	}, "desktop action %s for %s", eventType, current.Name)
}

// pageValue returns the stored anime page URL.
func pageValue(item contracts.MobileAnime) *string {
	return item.SourceURL
}

// folderValue returns the stored anime folder path.
func folderValue(item contracts.MobileAnime) *string {
	return item.Folder
}
