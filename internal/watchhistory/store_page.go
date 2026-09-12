package watchhistory

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

const (
	defaultPageLimit = 50
	maxPageLimit     = 200

	pageSelectColumns = "id, anime_id, anime_name, episode, cycle, watched_at_ms, source"
)

// PageQuery is a keyset page request. Limit 0 uses the default, clamped to
// a maximum; Cursor "" requests the first page.
type PageQuery struct {
	Limit  int
	Cursor string
}

// Page is one newest-first keyset-paged result.
type Page struct {
	Items      []Entry
	NextCursor string
}

// Entry is one read watch_history row.
type Entry struct {
	ID          int64
	AnimeID     string
	AnimeName   string
	Episode     int64
	Cycle       int64
	WatchedAtMS int64
	Source      string
}

// pageCursor is the pagination cursor for Page/AnimePage, keyed on
// (watched_at_ms, id) -- id is the tiebreaker that makes the cursor total,
// since equal timestamps are ordinary (design.md D5).
type pageCursor struct {
	WatchedAtMS int64
	ID          int64
}

// encodePageCursor serializes a pagination cursor to the opaque
// "<watched_at_ms>:<id>" form, matching eventlog.EventSearchPage's
// NextCursor convention.
func encodePageCursor(cursor pageCursor) string {
	return fmt.Sprintf("%d:%d", cursor.WatchedAtMS, cursor.ID)
}

// decodePageCursor parses an opaque page cursor into its parts.
func decodePageCursor(value string) (pageCursor, error) {
	var cursor pageCursor
	if _, err := fmt.Sscanf(value, "%d:%d", &cursor.WatchedAtMS, &cursor.ID); err != nil {
		return pageCursor{}, fmt.Errorf("invalid watch-history page cursor %q: %w", value, err)
	}
	return cursor, nil
}

// clampPageLimit applies the default/ceiling clamp: a non-positive limit
// falls back to the default, and any request above the ceiling is capped.
func clampPageLimit(limit int) int {
	if limit <= 0 {
		return defaultPageLimit
	}
	if limit > maxPageLimit {
		return maxPageLimit
	}
	return limit
}

// Page returns a keyset page over the entire watch_history table, newest
// first.
func (s *Store) Page(ctx context.Context, q PageQuery) (Page, error) {
	return s.queryPage(ctx, "", q)
}

// AnimePage returns a keyset page scoped to one anime, seeking
// idx_watch_history_anime rather than scanning the full table.
func (s *Store) AnimePage(ctx context.Context, animeID string, q PageQuery) (Page, error) {
	return s.queryPage(ctx, animeID, q)
}

// queryPage builds and executes a keyset-paged SELECT, scoped to animeID
// when non-empty.
func (s *Store) queryPage(ctx context.Context, animeID string, q PageQuery) (Page, error) {
	limit := clampPageLimit(q.Limit)
	query, args, err := buildPageQuery(animeID, q.Cursor, limit)
	if err != nil {
		return Page{}, err
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return Page{}, fmt.Errorf("query watch_history page: %w", err)
	}
	defer func() { _ = rows.Close() }()

	page, err := scanPage(rows, limit)
	if err != nil {
		return Page{}, err
	}
	return page, rows.Err()
}

// buildPageQuery assembles the newest-first keyset query and its bind
// arguments, requesting limit+1 rows so the caller can detect a further
// page without a second round trip.
func buildPageQuery(animeID, cursor string, limit int) (string, []any, error) {
	query := "SELECT " + pageSelectColumns + " FROM watch_history"
	var conditions []string
	var args []any
	if animeID != "" {
		conditions = append(conditions, "anime_id = ?")
		args = append(args, animeID)
	}
	if cursor != "" {
		c, err := decodePageCursor(cursor)
		if err != nil {
			return "", nil, err
		}
		conditions = append(conditions, "(watched_at_ms < ? OR (watched_at_ms = ? AND id < ?))")
		args = append(args, c.WatchedAtMS, c.WatchedAtMS, c.ID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY watched_at_ms DESC, id DESC LIMIT ?"
	return query, append(args, limit+1), nil
}

// scanPage drains rows into a bounded page, setting NextCursor only when
// the limit+1 probe row proves a further page exists.
func scanPage(rows *sql.Rows, limit int) (Page, error) {
	page := Page{Items: []Entry{}}
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.AnimeID, &e.AnimeName, &e.Episode, &e.Cycle, &e.WatchedAtMS, &e.Source); err != nil {
			return Page{}, fmt.Errorf("scan watch_history row: %w", err)
		}
		if len(page.Items) <= limit {
			page.Items = append(page.Items, e)
		}
	}
	if len(page.Items) > limit {
		page.Items = page.Items[:limit]
		last := page.Items[len(page.Items)-1]
		page.NextCursor = encodePageCursor(pageCursor{WatchedAtMS: last.WatchedAtMS, ID: last.ID})
	}
	return page, nil
}
