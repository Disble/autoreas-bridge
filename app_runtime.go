package main

import (
	"context"
	"fmt"
	"time"

	"autoreas-bridge/internal/api/contracts"
	sharedlogger "autoreas-bridge/internal/logger"
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
	genToken := a.newToken
	if genToken == nil {
		genToken = defaultPairingTokenGenerator
	}
	token, err := genToken()
	if err != nil {
		return fmt.Sprintf("token generation failed: %s", err.Error())
	}
	if err := a.deviceStore.SavePairingToken(a.appContext(), token, time.Now().UnixMilli()); err != nil {
		return fmt.Sprintf("token persist failed: %s", err.Error())
	}
	return token
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

func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
