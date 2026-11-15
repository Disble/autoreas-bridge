package desktop

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/device"
	bridgeSync "autoreas-bridge/internal/sync"
	"autoreas-bridge/internal/watchhistory"
)

// effectiveAddress returns the address the HTTP server actually bound, which
// differs from the configured one when the port was taken, or "" when no
// server is running. The shell handle exposes it to shell capabilities.
func (a *App) effectiveAddress() string {
	if a.httpServer == nil {
		return ""
	}
	return a.httpServer.EffectiveAddress()
}

// GetEffectiveAddress returns the address the HTTP server actually bound, through
// the api module handle: unavailable while the module starts, failed_precondition
// when the server failed to start.
func (a *App) GetEffectiveAddress() (string, error) {
	return a.moduleSet().api.Use(func(services apiServices) (string, error) {
		return services.server.EffectiveAddress(), nil
	})
}

// TriggerReconcile asks the sync service for an immediate reconcile pass,
// through the sync module handle.
func (a *App) TriggerReconcile() error {
	_, err := a.moduleSet().sync.Use(func(services syncServices) (struct{}, error) {
		return struct{}{}, services.trigger.TriggerReconcile(a.appContext())
	})
	return err
}

// GetSQLiteStatus pings the bridge database through the backup module handle and
// returns "ok", or the ping failure as an internal error. A ping rather than a
// handle check: an open handle over a deleted or locked file still looks healthy.
func (a *App) GetSQLiteStatus() (string, error) {
	return a.moduleSet().backup.Use(func(services backupServices) (string, error) {
		if err := services.db.PingContext(a.appContext()); err != nil {
			return "", err
		}
		return "ok", nil
	})
}

// GetPairingToken returns the active pairing token, minting one when none is
// live, through the devices module handle. Expired tokens are pruned first, so a
// token this returns is always within its TTL; a failed step is an internal error.
func (a *App) GetPairingToken() (string, error) {
	return a.moduleSet().devices.Use(func(services deviceServices) (string, error) {
		ctx := a.appContext()
		nowMs := time.Now().UnixMilli()
		activeAfterMs := nowMs - device.PairingTokenTTL.Milliseconds()
		if _, err := services.store.PruneExpiredPairingTokens(ctx, activeAfterMs); err != nil {
			return "", fmt.Errorf("token cleanup failed: %w", err)
		}
		activeToken, err := services.store.FindActivePairingToken(ctx, activeAfterMs)
		if err == nil {
			return activeToken, nil
		}
		if !errors.Is(err, device.ErrInvalidPairingToken) {
			return "", fmt.Errorf("token lookup failed: %w", err)
		}
		token, err := services.newToken()
		if err != nil {
			return "", fmt.Errorf("token generation failed: %w", err)
		}
		if err := services.store.SavePairingToken(ctx, token, nowMs); err != nil {
			return "", fmt.Errorf("token persist failed: %w", err)
		}
		return token, nil
	})
}

// GetConnectedDevices lists the paired devices with their sync state, through the
// devices module handle. No paired device is an empty, non-nil list.
func (a *App) GetConnectedDevices() ([]contracts.DeviceInfo, error) {
	return a.moduleSet().devices.Use(func(services deviceServices) ([]contracts.DeviceInfo, error) {
		return services.admin.ListDevices(a.appContext())
	})
}

// UnpairDevice revokes a paired device's access, through the devices module handle.
func (a *App) UnpairDevice(deviceID string) error {
	_, err := a.moduleSet().devices.Use(func(services deviceServices) (struct{}, error) {
		return struct{}{}, services.admin.RevokeDevice(a.appContext(), deviceID)
	})
	return err
}

// GetSyncingAnimeItems lists the anime with writes still pending sync, through
// the sync module handle. Nothing pending is an empty, non-nil list.
func (a *App) GetSyncingAnimeItems() ([]contracts.SyncingAnimeItem, error) {
	return a.moduleSet().sync.Use(func(services syncServices) ([]contracts.SyncingAnimeItem, error) {
		return services.trigger.ListPendingAnimeSyncs(a.appContext())
	})
}

// bindServerModules binds the sync trigger and the HTTP server to their handles. startHTTPServer
// calls it before settleModules marks sync and api ready, so a binding that sees ready finds them.
func (a *App) bindServerModules(syncTrigger *bridgeSync.TriggerService) {
	a.moduleSet().sync.Bind(syncServices{trigger: syncTrigger})
	a.moduleSet().api.Bind(apiServices{server: a.httpServer})
}

// bindDevicesModule binds the devices module's services: the device store, an
// admin service reading sync state from the bridge database and presence from the
// realtime hub when they are wired, and the pairing token generator.
func (a *App) bindDevicesModule() {
	if a.deviceStore == nil {
		return
	}
	admin := device.NewService(a.deviceStore)
	if a.bridgeDB != nil {
		admin.SetSyncStateStore(syncDeviceStateAdapter{store: bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(a.bridgeDB))})
	}
	if a.realtimeHub != nil {
		admin.SetPresenceStore(a.realtimeHub)
	}
	newToken := a.newToken
	if newToken == nil {
		newToken = defaultPairingTokenGenerator
	}
	a.moduleSet().devices.Bind(deviceServices{store: a.deviceStore, admin: admin, newToken: newToken})
}

// GetAnimes returns the flat catalog list model through the anime module handle:
// unavailable while the module starts, failed_precondition after it failed,
// internal when the query fails. An empty catalog is an empty, non-nil list.
func (a *App) GetAnimes() ([]contracts.AnimeListItem, error) {
	return a.moduleSet().anime.Use(func(services animeServices) ([]contracts.AnimeListItem, error) {
		items, err := services.query.ListAnimeItems(a.appContext())
		if err != nil {
			return nil, err
		}
		if items == nil {
			return []contracts.AnimeListItem{}, nil
		}
		return items, nil
	})
}

// isAnimeNotFound reports whether an anime read failed because the anime does
// not exist, as opposed to the anime module not being ready or a failed read.
func isAnimeNotFound(err error) bool {
	code, _ := apperr.CodeOf(err)
	return code == apperr.CodeNotFound
}

// GetAnimeDetail returns the rich MobileAnime DTO for a single anime ID
// (Anime Detail spec, "AnimeDetail DTO and GetAnimeDetail Binding"). It
// returns *contracts.MobileAnime directly -- no separate contracts.AnimeDetail
// Go struct exists, since MobileAnime is already the rich superset the spec's
// "AnimeDetail DTO" language describes; that naming is satisfied on the
// TypeScript side instead (frontend AnimeDetail type). It reads through the
// anime module handle; an unknown id is not_found, so a missing anime stays
// distinguishable from a module that is not ready or a failed read.
func (a *App) GetAnimeDetail(id string) (*contracts.MobileAnime, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (*contracts.MobileAnime, error) {
		item, err := services.query.GetMobileAnime(a.appContext(), id)
		if errors.Is(err, contracts.ErrAnimeNotFound) || (err == nil && item == nil) {
			return nil, apperr.NotFound("anime " + id + " not found")
		}
		return item, err
	})
}

// GetWatchHistoryPage returns a keyset page over the global real-watch-
// history log, narrowed by the request's optional search/watched-range/
// anime-ID filters and ordered newest- or oldest-first (History UI Redesign
// spec, "Read Models Are Keyset-Paged"), through the anime module handle. An
// unrecognized Order is invalid_argument and a query error is internal, so a
// failure never reads as an empty page.
func (a *App) GetWatchHistoryPage(request contracts.WatchHistoryPageRequest) (contracts.WatchHistoryPage, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.WatchHistoryPage, error) {
		query, err := toWatchHistoryPageQuery(request)
		if err != nil {
			return contracts.WatchHistoryPage{}, apperr.InvalidArgument(err.Error())
		}
		page, err := services.watchHistory.Page(a.appContext(), query)
		if err != nil {
			return contracts.WatchHistoryPage{}, err
		}
		return toWatchHistoryPage(page), nil
	})
}

// GetAnimeWatchHistoryPage returns a keyset page scoped to one anime,
// optionally narrowed to a single watch cycle, through the anime module
// handle like GetWatchHistoryPage.
func (a *App) GetAnimeWatchHistoryPage(request contracts.AnimeWatchHistoryPageRequest) (contracts.WatchHistoryPage, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.WatchHistoryPage, error) {
		page, err := services.watchHistory.AnimePage(a.appContext(), request.AnimeID, toAnimeWatchHistoryPageQuery(request))
		if err != nil {
			return contracts.WatchHistoryPage{}, err
		}
		return toWatchHistoryPage(page), nil
	})
}

// GetAnimeDetailView is the structured detail read model (progress/dates/
// content/download groups), renamed at merge time: the `GetAnimeDetail` name
// stays with the flat MobileAnime binding above because the shipped
// anime-detail UI consumes it; this structured variant has no frontend
// consumer yet and is kept for UI work built against it. It reads through the
// anime module handle; an unknown id is not_found.
func (a *App) GetAnimeDetailView(animeID string) (contracts.AnimeDetail, error) {
	return a.moduleSet().anime.Use(func(services animeServices) (contracts.AnimeDetail, error) {
		item, err := services.query.GetAnimeDetail(a.appContext(), animeID)
		if errors.Is(err, contracts.ErrAnimeNotFound) || (err == nil && item == nil) {
			return contracts.AnimeDetail{}, apperr.NotFound("anime " + animeID + " not found")
		}
		if err != nil {
			return contracts.AnimeDetail{}, err
		}
		return *item, nil
	})
}

// GetEpisodeSchedule returns the episodes airing on the given day, through the
// episodes module handle: unavailable while the module starts, failed_precondition
// after it failed, internal when the service fails. A day with no episodes is an
// empty, non-nil list.
func (a *App) GetEpisodeSchedule(day string) ([]contracts.EpisodeScheduleItem, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) ([]contracts.EpisodeScheduleItem, error) {
		items, err := services.episodes.ListEpisodeSchedule(a.appContext(), anime.EpisodeScheduleQuery{Day: day})
		if err != nil {
			return nil, err
		}
		return toEpisodeScheduleContracts(items), nil
	})
}

// AdjustWatchedEpisodes moves an anime's watched-episode count by delta, through the episodes
// module handle. base is the caller's last-seen modification stamp and drives optimistic
// concurrency, so a stale desktop view loses to a newer write. That conflict is an outcome of
// the result; a failure is the binding's error.
func (a *App) AdjustWatchedEpisodes(animeID string, delta float64, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.AdjustWatchedEpisodes(a.appContext(), anime.AdjustWatchedEpisodesCommand{
			AnimeID: animeID,
			Delta:   delta,
			Base:    &base,
			Source:  anime.ActivitySourceDesktop,
		}))
	})
}

// SetAnimeState sets an anime's watch state, under the same base-stamp
// optimistic concurrency and failures as AdjustWatchedEpisodes.
func (a *App) SetAnimeState(animeID string, estado int, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.SetAnimeState(a.appContext(), anime.SetAnimeStateCommand{
			AnimeID: animeID,
			Estado:  estado,
			Base:    &base,
			Source:  anime.ActivitySourceDesktop,
		}))
	})
}

// SetAnimeDays replaces an anime's airing days, under the same base-stamp
// optimistic concurrency and failures as AdjustWatchedEpisodes.
func (a *App) SetAnimeDays(animeID string, dias []string, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.SetAnimeDays(a.appContext(), anime.SetAnimeDaysCommand{
			AnimeID: animeID,
			Dias:    dias,
			Base:    &base,
		}))
	})
}

// SoftDeleteAnime marks an anime deleted without dropping its row, so
// RestoreAnime can bring it back and sync can propagate the deletion. Its
// failures are AdjustWatchedEpisodes'.
func (a *App) SoftDeleteAnime(animeID string, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.SoftDeleteAnime(a.appContext(), anime.SoftDeleteAnimeCommand{
			AnimeID: animeID,
			Base:    &base,
			Source:  anime.ActivitySourceDesktop,
		}))
	})
}

// RestoreAnime undoes a SoftDeleteAnime, with AdjustWatchedEpisodes' failures.
func (a *App) RestoreAnime(animeID string, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.RestoreAnime(a.appContext(), anime.RestoreAnimeCommand{
			AnimeID: animeID,
			Base:    &base,
			Source:  anime.ActivitySourceDesktop,
		}))
	})
}

// RepeatAnime starts a new watch-through of a finished anime, recording the
// repeat rather than resetting the original progress. Its failures are
// AdjustWatchedEpisodes'.
func (a *App) RepeatAnime(animeID string, base int64) (contracts.EpisodeCommandResult, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) (contracts.EpisodeCommandResult, error) {
		return toEpisodeCommandOutcome(services.episodes.RepeatAnime(a.appContext(), anime.RepeatAnimeCommand{
			AnimeID: animeID,
			Base:    &base,
			Source:  anime.ActivitySourceDesktop,
		}))
	})
}

// toEpisodeCommandOutcome answers an episode write inside the episodes module
// handle: the command's error when it failed, otherwise its outcome (applied,
// no_op or conflict) as the result.
func toEpisodeCommandOutcome(result anime.EpisodeCommandResult, err error) (contracts.EpisodeCommandResult, error) {
	if err != nil {
		return contracts.EpisodeCommandResult{}, err
	}
	return toEpisodeCommandContract(result), nil
}

// GetEpisodeDayCounts returns the per-weekday active-progress badge counts
// (episodes-cover-pipeline spec, "Per-day active-progress count mirrors
// Legacy's buscarMedalla semantics"), with GetEpisodeSchedule's failures: it
// never answers an empty list for a module that is not ready or a failed read.
func (a *App) GetEpisodeDayCounts() ([]contracts.EpisodeDayCount, error) {
	return a.moduleSet().episodes.Use(func(services episodeServices) ([]contracts.EpisodeDayCount, error) {
		counts, err := services.episodes.ListEpisodeDayCounts(a.appContext())
		if err != nil {
			return nil, err
		}
		return toEpisodeDayCountContracts(counts), nil
	})
}

// appContext returns the application context or a background fallback.
func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

// toWatchHistoryPage maps a watchhistory.Page read model into its API
// contract shape, tagging the result Status "ok".
func toWatchHistoryPage(page watchhistory.Page) contracts.WatchHistoryPage {
	return contracts.WatchHistoryPage{Items: toWatchHistoryEntries(page.Items), NextCursor: page.NextCursor, Status: "ok"}
}

// toWatchHistoryEntries maps real-watch-history read-model rows to their API
// contract shape.
func toWatchHistoryEntries(items []watchhistory.Entry) []contracts.WatchHistoryEntry {
	entries := make([]contracts.WatchHistoryEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, contracts.WatchHistoryEntry{
			ID:          item.ID,
			AnimeID:     item.AnimeID,
			AnimeName:   item.AnimeName,
			Episode:     item.Episode,
			Cycle:       item.Cycle,
			WatchedAtMS: item.WatchedAtMS,
			Source:      item.Source,
		})
	}
	return entries
}

// toEpisodeScheduleContracts maps episode schedule items to API contracts.
func toEpisodeScheduleContracts(items []anime.EpisodeScheduleItem) []contracts.EpisodeScheduleItem {
	result := make([]contracts.EpisodeScheduleItem, 0, len(items))
	for _, item := range items {
		var mark *contracts.LongEpisodeMark
		if item.LongNextEpisode != nil {
			mark = &contracts.LongEpisodeMark{
				Episode: item.LongNextEpisode.Episode,
				Minutes: item.LongNextEpisode.Minutes,
			}
		}
		result = append(result, contracts.EpisodeScheduleItem{
			AnimeID:         item.AnimeID,
			AnimeName:       item.AnimeName,
			Status:          item.Estado,
			EpisodesWatched: item.NroCapVisto,
			TotalEpisodes:   item.TotalCap,
			Day:             item.Day,
			DayOrder:        item.DayOrder,
			ModifiedAt:      item.ModifiedAt,
			FolderPath:      item.FolderPath,
			PageURL:         item.PageURL,
			HasCover:        item.HasCover,
			LongNextEpisode: mark,
			LastWatched:     item.LastWatched,
			FirstWatched:    item.FirstWatched,
		})
	}
	return result
}

// toEpisodeDayCountContracts maps episode day counts to API contracts.
func toEpisodeDayCountContracts(items []anime.EpisodeDayCount) []contracts.EpisodeDayCount {
	result := make([]contracts.EpisodeDayCount, 0, len(items))
	for _, item := range items {
		result = append(result, contracts.EpisodeDayCount{Day: item.Day, Count: item.Count})
	}
	return result
}

// toEpisodeCommandContract maps an episode command result to its API contract.
func toEpisodeCommandContract(result anime.EpisodeCommandResult) contracts.EpisodeCommandResult {
	return contracts.EpisodeCommandResult{
		Status:          "ok",
		AnimeID:         result.AnimeID,
		Outcome:         string(result.Outcome),
		ModifiedAt:      result.ModifiedAt,
		ConflictID:      result.ConflictID,
		AnimeName:       result.AnimeName,
		AnimeStatus:     result.Estado,
		EpisodesWatched: result.NroCapVisto,
		OccurredAtMs:    result.OccurredAtMs,
		CorrelationID:   result.CorrelationID,
	}
}
