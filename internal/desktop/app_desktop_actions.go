package desktop

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	sharedlogger "autoreas-bridge/internal/logger"
)

// The four desktop actions read the anime's stored page or folder, so they run
// through the anime module handle: unavailable while it starts,
// failed_precondition after it failed, and nothing is launched or copied then.

// OpenAnimePage opens the anime's stored page in the default browser and
// records the activity. The stored URL is validated at this sink rather than
// trusted: a hostile value in the database must not reach the OS launcher.
func (a *App) OpenAnimePage(animeID string) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.EpisodeCommandResult, error) {
		return a.runAnimeDesktopAction(services, animeID, "anime.page_opened", pageValue, func(ctx context.Context, value string) error {
			if err := anime.ValidatePageURL(value); err != nil {
				return err
			}
			a.ensureRuntimeDependencies()
			a.openURL(ctx, value)
			return nil
		})
	})
}

// CopyAnimePage copies the anime's stored page URL to the clipboard and records
// the activity. No URL validation, because the clipboard is not a launcher.
func (a *App) CopyAnimePage(animeID string) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.EpisodeCommandResult, error) {
		return a.runAnimeDesktopAction(services, animeID, "anime.page_copied", pageValue, a.copyDesktopValue)
	})
}

// OpenAnimeFolder opens the anime's download folder in the file manager and
// records the activity. The stored path is validated at this sink for the same
// reason as OpenAnimePage.
func (a *App) OpenAnimeFolder(animeID string) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.EpisodeCommandResult, error) {
		return a.runAnimeDesktopAction(services, animeID, "anime.folder_opened", folderValue, func(_ context.Context, value string) error {
			if err := anime.ValidateLocalFolder(value); err != nil {
				return err
			}
			a.ensureRuntimeDependencies()
			return a.openFolder(value)
		})
	})
}

// CopyAnimeFolder copies the anime's download-folder path to the clipboard and
// records the activity.
func (a *App) CopyAnimeFolder(animeID string) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.EpisodeCommandResult, error) {
		return a.runAnimeDesktopAction(services, animeID, "anime.folder_copied", folderValue, a.copyDesktopValue)
	})
}

// copyDesktopValue copies one stored page or folder value to the clipboard.
func (a *App) copyDesktopValue(ctx context.Context, value string) error {
	a.ensureRuntimeDependencies()
	return a.copyText(ctx, value)
}

// runAnimeDesktopAction reads the anime, runs the desktop action on its stored
// value and records its telemetry through the shared logger. An unknown anime
// is not_found, an anime without the value is invalid_argument, and a failed
// read, launch or copy is internal. Recording is best-effort (D7): Logf never
// fails, so a completed action always answers its result.
func (a *App) runAnimeDesktopAction(
	services animeServices,
	animeID, eventType string,
	valueFn func(contracts.MobileAnime) *string,
	run func(context.Context, string) error,
) (contracts.EpisodeCommandResult, error) {
	current, err := services.query.GetMobileAnime(a.appContext(), animeID)
	if errors.Is(err, contracts.ErrAnimeNotFound) || (err == nil && current == nil) {
		return contracts.EpisodeCommandResult{}, apperr.NotFound("anime not found")
	}
	if err != nil {
		return contracts.EpisodeCommandResult{}, err
	}

	value := valueFn(*current)
	if value == nil || strings.TrimSpace(*value) == "" {
		return contracts.EpisodeCommandResult{}, apperr.InvalidArgument("anime action value unavailable")
	}

	if err := run(a.appContext(), *value); err != nil {
		return contracts.EpisodeCommandResult{}, err
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
	}, nil
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
