package main

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

func (a *App) GetBridgeStatus() string {
	if a.startupErr != nil {
		return a.startupErr.Error()
	}
	return "ok"
}

func (a *App) GetEffectiveAddress() string {
	if a.httpServer == nil {
		return ""
	}
	return a.httpServer.EffectiveAddress()
}

func (a *App) TriggerReconcile() string {
	if a.syncTrigger == nil {
		return "sync service unavailable"
	}
	if err := a.syncTrigger.TriggerReconcile(a.appContext()); err != nil {
		return err.Error()
	}
	return "ok"
}

// PullAnimesFromLegacy performs a one-shot bridge<-legacy sync from animes.dat.
func (a *App) PullAnimesFromLegacy() contracts.AnimeLegacyPullResult {
	if a.animeLegacyPull == nil {
		return contracts.AnimeLegacyPullResult{
			Status:  "error",
			Message: "legacy pull service unavailable",
		}
	}

	return a.animeLegacyPull.Pull(a.appContext())
}

func (a *App) GetSQLiteStatus() string {
	if a.bridgeDB == nil {
		return "db unavailable"
	}
	if err := a.bridgeDB.PingContext(a.appContext()); err != nil {
		return err.Error()
	}
	return "ok"
}

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

func (a *App) GetConnectedDevices() []contracts.DeviceInfo {
	if a.deviceStore == nil {
		return []contracts.DeviceInfo{}
	}
	service := device.NewService(a.deviceStore)
	if a.bridgeDB != nil {
		service.SetSyncStateStore(syncDeviceStateAdapter{store: bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(a.bridgeDB))})
	}
	devices, err := service.ListDevices(a.appContext())
	if err != nil {
		return []contracts.DeviceInfo{}
	}
	return devices
}

func (a *App) UnpairDevice(deviceID string) string {
	if a.deviceStore == nil {
		return "device store unavailable"
	}
	service := device.NewService(a.deviceStore)
	if a.bridgeDB != nil {
		service.SetSyncStateStore(syncDeviceStateAdapter{store: bridgeSync.NewChangelogStore(bridgeSync.NewSyncSQLiteProvider(a.bridgeDB))})
	}
	if err := service.RevokeDevice(a.appContext(), deviceID); err != nil {
		return err.Error()
	}
	return "ok"
}

func (a *App) GetRecentLogs() []sharedlogger.LogEntry {
	if a.memLogger == nil {
		return []sharedlogger.LogEntry{}
	}
	return a.memLogger.Recent()
}

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

func (a *App) GetChapterSchedule(day string) []contracts.ChapterScheduleItem {
	if a.chapterService == nil {
		return []contracts.ChapterScheduleItem{}
	}
	items, err := a.chapterService.ListChapterSchedule(a.appContext(), anime.ChapterScheduleQuery{Day: day})
	if err != nil {
		return []contracts.ChapterScheduleItem{}
	}
	return toChapterScheduleContracts(items)
}

// GetAnimeCover resolves a single anime's cover into a base64 data-URL, or
// an explicit placeholder signal (chapters-cover-pipeline spec, "Cover
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
	portada := ""
	if current.Portada != nil {
		portada = *current.Portada
	}
	res := a.coverResolver.Resolve(a.appContext(), animeID, portada)
	if !res.IsCover {
		return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder}
	}
	return contracts.AnimeCover{DataURL: res.DataURL, Source: contracts.CoverSourceCover}
}

func (a *App) AdjustWatchedChapters(animeID string, delta float64, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.AdjustWatchedChapters(a.appContext(), anime.AdjustWatchedChaptersCommand{
		AnimeID: animeID,
		Delta:   delta,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

func (a *App) SetAnimeState(animeID string, estado int, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.SetAnimeState(a.appContext(), anime.SetAnimeStateCommand{
		AnimeID: animeID,
		Estado:  estado,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

func (a *App) SetAnimeDays(animeID string, dias []string, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.SetAnimeDays(a.appContext(), anime.SetAnimeDaysCommand{
		AnimeID: animeID,
		Dias:    dias,
		Base:    &base,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

func (a *App) SoftDeleteAnime(animeID string, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.SoftDeleteAnime(a.appContext(), anime.SoftDeleteAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

func (a *App) RestoreAnime(animeID string, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.RestoreAnime(a.appContext(), anime.RestoreAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

func (a *App) RepeatAnime(animeID string, base int64) contracts.ChapterCommandResult {
	if a.chapterService == nil {
		return contracts.ChapterCommandResult{Status: "error", Message: "chapter service unavailable"}
	}
	result, err := a.chapterService.RepeatAnime(a.appContext(), anime.RepeatAnimeCommand{
		AnimeID: animeID,
		Base:    &base,
		Source:  anime.ActivitySourceDesktop,
	})
	if err != nil {
		return contracts.ChapterCommandResult{Status: "error", Message: err.Error()}
	}
	return toChapterCommandContract(result)
}

// GetChapterDayCounts returns the per-weekday active-progress badge counts
// (chapters-cover-pipeline spec, "Per-day active-progress count mirrors
// Legacy's buscarMedalla semantics"). Degrades to an empty (non-nil) slice
// on a nil service or any query error, mirroring GetChapterSchedule's
// nil-guard contract.
func (a *App) GetChapterDayCounts() []contracts.ChapterDayCount {
	if a.chapterService == nil {
		return []contracts.ChapterDayCount{}
	}
	counts, err := a.chapterService.ListChapterDayCounts(a.appContext())
	if err != nil {
		return []contracts.ChapterDayCount{}
	}
	return toChapterDayCountContracts(counts)
}

func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

func toChapterScheduleContracts(items []anime.ChapterScheduleItem) []contracts.ChapterScheduleItem {
	result := make([]contracts.ChapterScheduleItem, 0, len(items))
	for _, item := range items {
		result = append(result, contracts.ChapterScheduleItem{
			AnimeID:      item.AnimeID,
			AnimeName:    item.AnimeName,
			Estado:       item.Estado,
			NroCapVisto:  item.NroCapVisto,
			TotalCap:     item.TotalCap,
			Day:          item.Day,
			DayOrder:     item.DayOrder,
			ModifiedAt:   item.ModifiedAt,
			FolderPath:   item.FolderPath,
			PageURL:      item.PageURL,
			HasCover:     item.HasCover,
			LastWatched:  item.LastWatched,
			FirstWatched: item.FirstWatched,
		})
	}
	return result
}

func toChapterDayCountContracts(items []anime.ChapterDayCount) []contracts.ChapterDayCount {
	result := make([]contracts.ChapterDayCount, 0, len(items))
	for _, item := range items {
		result = append(result, contracts.ChapterDayCount{Day: item.Day, Count: item.Count})
	}
	return result
}

func toChapterCommandContract(result anime.ChapterCommandResult) contracts.ChapterCommandResult {
	return contracts.ChapterCommandResult{
		Status:        "ok",
		AnimeID:       result.AnimeID,
		AnimeName:     result.AnimeName,
		Estado:        result.Estado,
		NroCapVisto:   result.NroCapVisto,
		OccurredAtMs:  result.OccurredAtMs,
		CorrelationID: result.CorrelationID,
	}
}
