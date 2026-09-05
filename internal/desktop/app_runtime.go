package desktop

import (
	"context"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
	sharedlogger "autoreas-bridge/internal/logger"
	bridgeSync "autoreas-bridge/internal/sync"
)

// episodeServiceUnavailableMessage is what every episode binding returns when the episode
// service was never wired. Shared with app_season_availability.go (same package).
const episodeServiceUnavailableMessage = "episode service unavailable"

// GetBridgeStatus reports "ok" once startup completed, or the startup error
// message. It is the frontend's single readiness signal for the Go side.
func (a *App) GetBridgeStatus() string {
	if a.startupErr != nil {
		return a.startupErr.Error()
	}
	return "ok"
}

// GetEffectiveAddress returns the address the HTTP server actually bound, which
// differs from the configured one when the port was taken. Empty when no server
// is running, so the pairing UI can say so instead of showing a stale address.
func (a *App) GetEffectiveAddress() string {
	if a.httpServer == nil {
		return ""
	}
	return a.httpServer.EffectiveAddress()
}

// TriggerReconcile asks the sync service for an immediate reconcile pass and
// returns "ok" or the reason it could not run.
func (a *App) TriggerReconcile() string {
	if a.syncTrigger == nil {
		return "sync service unavailable"
	}
	if err := a.syncTrigger.TriggerReconcile(a.appContext()); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetSQLiteStatus pings the bridge database and returns "ok" or the failure.
// A ping rather than a handle check: an open handle over a deleted or locked
// file still looks healthy.
func (a *App) GetSQLiteStatus() string {
	if a.bridgeDB == nil {
		return "db unavailable"
	}
	if err := a.bridgeDB.PingContext(a.appContext()); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetPairingToken returns the active pairing token, minting one when none is
// live. Expired tokens are pruned first, so a token this returns is always
// within its TTL. Failures come back as a message rather than an error, since
// the binding's single string is what the pairing screen renders.
func (a *App) GetPairingToken() string {
	if a.deviceStore == nil {
		return "device store unavailable"
	}
	nowMs := time.Now().UnixMilli()
	activeAfterMs := nowMs - device.PairingTokenTTL.Milliseconds()
	if _, err := a.deviceStore.PruneExpiredPairingTokens(a.appContext(), activeAfterMs); err != nil {
		return fmt.Sprintf("token cleanup failed: %s", err.Error())
	}
	activeToken, err := a.deviceStore.FindActivePairingToken(a.appContext(), activeAfterMs)
	if err == nil {
		return activeToken
	}
	if !errors.Is(err, device.ErrInvalidPairingToken) {
		return fmt.Sprintf("token lookup failed: %s", err.Error())
	}
	genToken := a.newToken
	if genToken == nil {
		genToken = defaultPairingTokenGenerator
	}
	token, err := genToken()
	if err != nil {
		return fmt.Sprintf("token generation failed: %s", err.Error())
	}
	if err := a.deviceStore.SavePairingToken(a.appContext(), token, nowMs); err != nil {
		return fmt.Sprintf("token persist failed: %s", err.Error())
	}
	return token
}

// GetConnectedDevices lists the paired devices with their sync state. Degrades
// to an empty (non-nil) slice on an unavailable store or a query error.
func (a *App) GetConnectedDevices() []contracts.DeviceInfo {
	if a.deviceStore == nil {
		return []contracts.DeviceInfo{}
	}
	service := device.NewService(a.deviceStore)
	if a.bridgeDB != nil {
		service.SetSyncStateStore(syncDeviceStateAdapter{store: bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(a.bridgeDB))})
	}
	devices, err := service.ListDevices(a.appContext())
	if err != nil {
		return []contracts.DeviceInfo{}
	}
	return devices
}

// UnpairDevice revokes a paired device's access and returns "ok" or the reason
// it could not.
func (a *App) UnpairDevice(deviceID string) string {
	if a.deviceStore == nil {
		return "device store unavailable"
	}
	service := device.NewService(a.deviceStore)
	if a.bridgeDB != nil {
		service.SetSyncStateStore(syncDeviceStateAdapter{store: bridgeSync.NewChangelogStore(bridgeSync.NewSQLiteProvider(a.bridgeDB))})
	}
	if err := service.RevokeDevice(a.appContext(), deviceID); err != nil {
		return err.Error()
	}
	return "ok"
}

// GetRecentLogs returns the in-memory log ring backing the Activity panel.
// Degrades to an empty (non-nil) slice when no memory logger is wired.
func (a *App) GetRecentLogs() []sharedlogger.LogEntry {
	if a.memLogger == nil {
		return []sharedlogger.LogEntry{}
	}
	return a.memLogger.Recent()
}

// GetSyncingAnimeItems lists the anime with writes still pending sync.
// Degrades to an empty (non-nil) slice on an unavailable service or a query
// error.
func (a *App) GetSyncingAnimeItems() []contracts.SyncingAnimeItem {
	if a.syncTrigger == nil {
		return []contracts.SyncingAnimeItem{}
	}
	items, err := a.syncTrigger.ListPendingAnimeSyncs(a.appContext())
	if err != nil {
		return []contracts.SyncingAnimeItem{}
	}
	return items
}

// GetAnimes returns the flat catalog list model. Degrades to an empty
// (non-nil) slice on a nil service or any query error: an empty catalog is a
// valid state and must not be reported to the UI as a failure.
func (a *App) GetAnimes() []contracts.AnimeListItem {
	if a.animeQuery == nil {
		return []contracts.AnimeListItem{}
	}
	items, err := a.animeQuery.ListAnimeItems(a.appContext())
	if err != nil {
		return []contracts.AnimeListItem{}
	}
	return items
}

// GetAnimeDetail returns the rich MobileAnime DTO for a single anime ID
// (Anime Detail spec, "AnimeDetail DTO and GetAnimeDetail Binding"). It
// returns *contracts.MobileAnime directly -- no separate contracts.AnimeDetail
// Go struct exists, since MobileAnime is already the rich superset the spec's
// "AnimeDetail DTO" language describes; that naming is satisfied on the
// TypeScript side instead (frontend AnimeDetail type). Additive only:
// GetAnimes/AnimeListItem are untouched. Degrades to nil on a nil service or
// any lookup error (not-found included), matching the not-found scenario's
// "distinguishable nil result, not a silent zero-value DTO" requirement.
func (a *App) GetAnimeDetail(id string) *contracts.MobileAnime {
	if a.animeQuery == nil {
		return nil
	}
	item, err := a.animeQuery.GetMobileAnime(a.appContext(), id)
	if err != nil {
		return nil
	}
	return item
}

// GetAnimeHistory returns the slim watch-activity read model (Anime History
// spec, "History Read Model"), server-sorted DESC by fechaUltCapVisto.
// Degrades to an empty (non-nil) slice on a nil service or any query error,
// mirroring GetAnimes's nil-guard contract.
func (a *App) GetAnimeHistory() []contracts.AnimeHistoryItem {
	if a.animeQuery == nil {
		return []contracts.AnimeHistoryItem{}
	}
	items, err := a.animeQuery.ListAnimeHistory(a.appContext())
	if err != nil {
		return []contracts.AnimeHistoryItem{}
	}
	return items
}

// GetAnimeDetailView is the structured detail read model (progress/dates/
// content/download groups), renamed at merge time: the `GetAnimeDetail` name
// stays with the flat MobileAnime binding above because the shipped
// anime-detail UI consumes it; this structured variant has no frontend
// consumer yet and is kept for UI work built against it.
func (a *App) GetAnimeDetailView(animeID string) contracts.AnimeDetail {
	if a.animeQuery == nil {
		return contracts.AnimeDetail{}
	}
	item, err := a.animeQuery.GetAnimeDetail(a.appContext(), animeID)
	if err != nil || item == nil {
		return contracts.AnimeDetail{}
	}
	return *item
}

// GetEpisodeSchedule returns the episodes airing on the given day. Degrades to
// an empty (non-nil) slice, mirroring GetAnimes's nil-guard contract.
func (a *App) GetEpisodeSchedule(day string) []contracts.EpisodeScheduleItem {
	if a.episodeService == nil {
		return []contracts.EpisodeScheduleItem{}
	}
	items, err := a.episodeService.ListEpisodeSchedule(a.appContext(), anime.EpisodeScheduleQuery{Day: day})
	if err != nil {
		return []contracts.EpisodeScheduleItem{}
	}
	return toEpisodeScheduleContracts(items)
}

// GetAnimeCover resolves a single anime's cover into a base64 data-URL, or
// an explicit placeholder signal (episodes-cover-pipeline spec, "Cover
// resolution follows a deterministic, placeholder-first order"). Degrades to
// the placeholder signal -- never an error -- on a nil dependency, a lookup
// failure, or a resolver-reported non-cover, mirroring GetAnimeDetail's
// nil-guard shape.
func (a *App) GetAnimeCover(animeID string) contracts.AnimeCover {
	if a.animeQuery == nil || a.coverResolver == nil {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	current, err := a.animeQuery.GetMobileAnime(a.appContext(), animeID)
	if err != nil || current == nil {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	cover := ""
	if current.Cover != nil {
		cover = *current.Cover
	}
	res := a.coverResolver.Resolve(a.appContext(), animeID, cover)
	if !res.IsCover {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	return contracts.AnimeCover{DataURL: res.DataURL, Source: contracts.CoverSourceCover}
}

// AdjustWatchedEpisodes moves an anime's watched-episode count by delta. base
// is the caller's last-seen modification stamp and drives optimistic
// concurrency, so a stale desktop view loses to a newer write instead of
// overwriting it.
func (a *App) AdjustWatchedEpisodes(animeID string, delta float64, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.AdjustWatchedEpisodes(a.appContext(), anime.AdjustWatchedEpisodesCommand{
		AnimeID: animeID,
		Delta:   delta,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// SetAnimeState sets an anime's watch state, under the same base-stamp
// optimistic concurrency as AdjustWatchedEpisodes.
func (a *App) SetAnimeState(animeID string, estado int, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.SetAnimeState(a.appContext(), anime.SetAnimeStateCommand{
		AnimeID: animeID,
		Estado:  estado,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// SetAnimeDays replaces an anime's airing days, under the same base-stamp
// optimistic concurrency as AdjustWatchedEpisodes.
func (a *App) SetAnimeDays(animeID string, dias []string, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.SetAnimeDays(a.appContext(), anime.SetAnimeDaysCommand{
		AnimeID: animeID,
		Dias:    dias,
		Base:    &base,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// SoftDeleteAnime marks an anime deleted without dropping its row, so
// RestoreAnime can bring it back and sync can propagate the deletion.
func (a *App) SoftDeleteAnime(animeID string, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.SoftDeleteAnime(a.appContext(), anime.SoftDeleteAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// RestoreAnime undoes a SoftDeleteAnime.
func (a *App) RestoreAnime(animeID string, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.RestoreAnime(a.appContext(), anime.RestoreAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// RepeatAnime starts a new watch-through of a finished anime, recording the
// repeat rather than resetting the original progress.
func (a *App) RepeatAnime(animeID string, base int64) contracts.EpisodeCommandResult {
	if a.episodeService == nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: episodeServiceUnavailableMessage}
	}
	result, err := a.episodeService.RepeatAnime(a.appContext(), anime.RepeatAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.EpisodeCommandResult{Status: "error", Message: err.Error()}
	}
	return toEpisodeCommandContract(result)
}

// GetEpisodeDayCounts returns the per-weekday active-progress badge counts
// (episodes-cover-pipeline spec, "Per-day active-progress count mirrors
// Legacy's buscarMedalla semantics"). Degrades to an empty (non-nil) slice
// on a nil service or any query error, mirroring GetEpisodeSchedule's
// nil-guard contract.
func (a *App) GetEpisodeDayCounts() []contracts.EpisodeDayCount {
	if a.episodeService == nil {
		return []contracts.EpisodeDayCount{}
	}
	counts, err := a.episodeService.ListEpisodeDayCounts(a.appContext())
	if err != nil {
		return []contracts.EpisodeDayCount{}
	}
	return toEpisodeDayCountContracts(counts)
}

// appContext returns the application context or a background fallback.
func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

// toEpisodeScheduleContracts maps episode schedule items to API contracts.
func toEpisodeScheduleContracts(items []anime.EpisodeScheduleItem) []contracts.EpisodeScheduleItem {
	result := make([]contracts.EpisodeScheduleItem, 0, len(items))
	for _, item := range items {
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
