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

func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}
