package desktop

import (
	"context"
	"database/sql"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/lengths"
	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/pathutil"
)

// mobileAnimeQuery serves Mobile's anime with their stored episode durations joined in
// (MobileAnime.Episodes) and their folder below the library root (MobileAnime.FolderRelative,
// ADR 027). Only the HTTP API is handed this decorator: every in-process caller of
// ListMobileAnimes keeps the plain query and pays no join.
type mobileAnimeQuery struct {
	contracts.AnimeQueryService
	durations   lengths.Reader
	libraryRoot func(context.Context) (string, error)
}

// ListMobileAnimes lists every anime with its episodes, joined in one read.
func (q mobileAnimeQuery) ListMobileAnimes(ctx context.Context) ([]contracts.MobileAnime, error) {
	items, err := q.AnimeQueryService.ListMobileAnimes(ctx)
	if err != nil {
		return nil, err
	}
	animes := make([]*contracts.MobileAnime, len(items))
	for i := range items {
		animes[i] = &items[i]
	}
	if err := lengths.AttachEpisodes(ctx, q.durations, animes...); err != nil {
		return nil, err
	}
	attachRelativeFolders(ctx, q.libraryRoot, animes...)
	return items, nil
}

// GetMobileAnime returns one anime with its episodes.
func (q mobileAnimeQuery) GetMobileAnime(ctx context.Context, id string) (*contracts.MobileAnime, error) {
	item, err := q.AnimeQueryService.GetMobileAnime(ctx, id)
	if err != nil || item == nil {
		return item, err
	}
	if err := lengths.AttachEpisodes(ctx, q.durations, item); err != nil {
		return nil, err
	}
	attachRelativeFolders(ctx, q.libraryRoot, item)
	return item, nil
}

// mobileSyncTrigger serves the changes feed with every change's snapshot carrying its current
// episodes and relative folder, read when served (analysis section 5): a changelog row records
// that something changed, and what it serves is always the stored state.
type mobileSyncTrigger struct {
	contracts.SyncTriggerService
	durations   lengths.Reader
	libraryRoot func(context.Context) (string, error)
}

// ListChangesSince returns the changes since sinceMs with episodes joined in.
func (s mobileSyncTrigger) ListChangesSince(ctx context.Context, sinceMs int64) ([]contracts.AnimeChange, int64, error) {
	changes, lastID, err := s.SyncTriggerService.ListChangesSince(ctx, sinceMs)
	return s.attach(ctx, changes, lastID, err)
}

// ListChangesAfterID returns the changes after lastID with episodes joined in.
func (s mobileSyncTrigger) ListChangesAfterID(ctx context.Context, lastID int64) ([]contracts.AnimeChange, int64, error) {
	changes, newLastID, err := s.SyncTriggerService.ListChangesAfterID(ctx, lastID)
	return s.attach(ctx, changes, newLastID, err)
}

// attach joins the episodes into every change that carries a snapshot, in one read.
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
	if err := lengths.AttachEpisodes(ctx, s.durations, animes...); err != nil {
		return nil, 0, err
	}
	attachRelativeFolders(ctx, s.libraryRoot, animes...)
	return changes, lastID, nil
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

// withMobileProjection decorates the two Mobile read ports with the episode join and the
// relative folder. Without a bridge database there are no durations or settings, and the ports
// are served as they are.
func withMobileProjection(db *sql.DB, libraryRoot func(context.Context) (string, error), query contracts.AnimeQueryService, trigger contracts.SyncTriggerService) (contracts.AnimeQueryService, contracts.SyncTriggerService) {
	if db == nil {
		return query, trigger
	}
	durations := episodes.NewStore(db, time.Now)
	if query != nil {
		query = mobileAnimeQuery{AnimeQueryService: query, durations: durations, libraryRoot: libraryRoot}
	}
	if trigger != nil {
		trigger = mobileSyncTrigger{SyncTriggerService: trigger, durations: durations, libraryRoot: libraryRoot}
	}
	return query, trigger
}
