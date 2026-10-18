package desktop

import (
	"context"
	"database/sql"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/lengths"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/pathutil"
	bridgeSync "autoreas-bridge/internal/sync"
)

// mobileAnimeQuery serves Mobile's anime with their stored episode durations joined in
// (MobileAnime.Episodes), their folder below the library root (MobileAnime.FolderRelative,
// ADR 027) and their open-season candidacy (MobileAnime.Season). Only the HTTP API is handed this
// decorator: every in-process caller of ListMobileAnimes keeps the plain query and pays no join.
type mobileAnimeQuery struct {
	contracts.AnimeQueryService
	durations   lengths.Reader
	libraryRoot func(context.Context) (string, error)
	seasons     bridgeSync.SeasonProjectionSource
}

// ListMobileAnimes lists every anime with its episodes and candidacy, each joined in one read.
func (q mobileAnimeQuery) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	items, err := q.AnimeQueryService.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}
	animes := make([]*contracts.MobileAnime, len(items))
	for i := range items {
		animes[i] = &items[i]
	}
	if err := attachMobileProjection(ctx, q.durations, q.libraryRoot, q.seasons, animes...); err != nil {
		return nil, err
	}
	return items, nil
}

// GetMobileAnime returns one anime with its episodes and candidacy.
func (q mobileAnimeQuery) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	item, err := q.AnimeQueryService.GetMobileAnime(ctx, id)
	if err != nil || item == nil {
		return item, err
	}
	if err := attachMobileProjection(ctx, q.durations, q.libraryRoot, q.seasons, item); err != nil {
		return nil, err
	}
	return item, nil
}

// mobileSyncTrigger serves the changes feed with every change's snapshot carrying its current
// episodes, relative folder and candidacy, read when served (analysis section 5): a changelog row
// records that something changed, and what it serves is always the stored state.
type mobileSyncTrigger struct {
	contracts.SyncTriggerService
	durations   lengths.Reader
	libraryRoot func(context.Context) (string, error)
	seasons     bridgeSync.SeasonProjectionSource
}

// ListChangesSince returns the changes since sinceMs with the projection joined in.
func (s mobileSyncTrigger) ListChangesSince(ctx context.Context, sinceMs int64) ([]contracts.AnimeChange, int64, error) {
	changes, lastID, err := s.SyncTriggerService.ListChangesSince(ctx, sinceMs)
	return s.attach(ctx, changes, lastID, err)
}

// ListChangesAfterID returns the changes after lastID with the projection joined in.
func (s mobileSyncTrigger) ListChangesAfterID(ctx context.Context, lastID int64) ([]contracts.AnimeChange, int64, error) {
	changes, newLastID, err := s.SyncTriggerService.ListChangesAfterID(ctx, lastID)
	return s.attach(ctx, changes, newLastID, err)
}

// attach joins the projection into every change that carries a snapshot.
func (s mobileSyncTrigger) attach(ctx context.Context, changes []contracts.AnimeChange, lastID int64, err error) ([]contracts.AnimeChange, int64, error) {
	if err != nil {
		return nil, 0, err
	}
	animes := make([]*contracts.MobileAnime, 0, len(changes))
	for i := range changes {
		if changes[i].Snapshot != nil {
			animes = append(animes, changes[i].Snapshot)
		}
	}
	if err := attachMobileProjection(ctx, s.durations, s.libraryRoot, s.seasons, animes...); err != nil {
		return nil, 0, err
	}
	return changes, lastID, nil
}

// attachMobileProjection joins the episodes, the relative folder and the candidacy into animes.
func attachMobileProjection(ctx context.Context, durations lengths.Reader, libraryRoot func(context.Context) (string, error), seasons bridgeSync.SeasonProjectionSource, animes ...*contracts.MobileAnime) error {
	if err := lengths.AttachEpisodes(ctx, durations, animes...); err != nil {
		return err
	}
	attachRelativeFolders(ctx, libraryRoot, animes...)
	return attachSeasons(ctx, seasons, animes...)
}

// attachSeasons sets each anime's Season from the open season's candidacies, read once. Unlike the
// relative folder, a failed read fails the Mobile read: an absent season means "not a candidate",
// so serving it on an error would tell the phone a candidate cannot be rated.
func attachSeasons(ctx context.Context, seasons bridgeSync.SeasonProjectionSource, animes ...*contracts.MobileAnime) error {
	if seasons == nil {
		return nil
	}
	candidacies, err := seasons(ctx)
	if err != nil {
		return err
	}
	byAnime := make(map[string]bridgeSync.SeasonCandidacy, len(candidacies))
	for _, candidacy := range candidacies {
		byAnime[candidacy.AnimeID] = candidacy
	}
	for _, item := range animes {
		item.Season = nil
		candidacy, ok := byAnime[item.ID]
		if !ok {
			continue
		}
		season := &contracts.MobileAnimeSeason{SeasonID: candidacy.SeasonID}
		if candidacy.Grade != nil {
			grade := *candidacy.Grade
			season.Grade = &grade
		}
		item.Season = season
	}
	return nil
}

// attachRelativeFolders sets each anime's FolderRelative from the library root, read once. The
// field is optional on the wire, so an unset or unreadable root omits it instead of failing a
// Mobile read that does not depend on it.
func attachRelativeFolders(ctx context.Context, libraryRoot func(context.Context) (string, error), animes ...*contracts.MobileAnime) {
	if libraryRoot == nil {
		return
	}
	root, err := libraryRoot(ctx)
	if err != nil {
		return
	}
	for _, item := range animes {
		item.FolderRelative = nil
		if item.Folder == nil {
			continue
		}
		if relative := pathutil.RelativeFolder(root, *item.Folder); relative != "" {
			item.FolderRelative = &relative
		}
	}
}

// withMobileProjection decorates the two Mobile read ports with the episode join, the relative
// folder and the season candidacy. Without a bridge database there are no durations or settings,
// and the ports are served as they are.
func withMobileProjection(db *sql.DB, libraryRoot func(context.Context) (string, error), seasons bridgeSync.SeasonProjectionSource, query contracts.AnimeQueryService, trigger contracts.SyncTriggerService) (contracts.AnimeQueryService, contracts.SyncTriggerService) {
	if db == nil {
		return query, trigger
	}
	durations := episodes.NewStore(db, time.Now)
	if query != nil {
		query = mobileAnimeQuery{AnimeQueryService: query, durations: durations, libraryRoot: libraryRoot, seasons: seasons}
	}
	if trigger != nil {
		trigger = mobileSyncTrigger{SyncTriggerService: trigger, durations: durations, libraryRoot: libraryRoot, seasons: seasons}
	}
	return query, trigger
}
