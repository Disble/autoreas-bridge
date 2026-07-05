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

func (a *App) GetAnimeDetail(animeID string) contracts.AnimeDetail {
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
			HasPage:      item.HasPage,
			HasFolder:    item.HasFolder,
			LastWatched:  item.LastWatched,
			FirstWatched: item.FirstWatched,
		})
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
