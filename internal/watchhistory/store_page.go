package watchhistory

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	defaultPageLimit = 50
	maxPageLimit     = 200

	pageSelectColumns = "id, anime_id, anime_name, episode, cycle, watched_at_ms, source"
)

// Order selects a page's sort direction and keyset comparator.
type Order uint8

const (
	// OrderNewestFirst pages watched_at_ms, id descending. It is Order's
	// zero value, so an unset PageQuery.Order keeps SDD-69's original
	// newest-first behavior.
	OrderNewestFirst Order = iota
	// OrderOldestFirst pages watched_at_ms, id ascending.
	OrderOldestFirst
)

// PageQuery is a keyset page request. Limit 0 uses the default, clamped to
// a maximum; Cursor "" requests the first page. Search, AnimeIDs, FromMS,
// ToMS and Cycle each independently narrow the result, applied in SQL
// before paging (design.md D1); every one of them is optional, and its zero
// value means "not applied".
type PageQuery struct {
	Limit    int
	Cursor   string
	Order    Order    // unknown value: buildPageQuery returns an error rather than defaulting
	Search   string   // trimmed, escaped, ASCII-case-insensitive substring of anime_name
	AnimeIDs []string // empty = not applied; bound as one JSON array read by json_each
	FromMS   int64    // inclusive watched_at_ms lower bound; 0 = unbounded
	ToMS     int64    // exclusive watched_at_ms upper bound; 0 = unbounded
	Cycle    int64    // 0 = every cycle
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

// Page returns a keyset page over the entire watch_history table. Order
// selects newest-first (the zero value) or oldest-first paging; Search,
// AnimeIDs, FromMS and ToMS narrow the result before paging (design.md D1).
func (s *Store) Page(ctx context.Context, q PageQuery) (Page, error) {
	return s.queryPage(ctx, "", q)
}

// AnimePage returns a keyset page scoped to one anime, seeking an
// anime-leading index rather than scanning the full table. Cycle, when
// greater than zero, further scopes the result to that one watch.
func (s *Store) AnimePage(ctx context.Context, animeID string, q PageQuery) (Page, error) {
	return s.queryPage(ctx, animeID, q)
}

// queryPage builds and executes a keyset-paged SELECT, scoped to animeID
// when non-empty.
func (s *Store) queryPage(ctx context.Context, animeID string, q PageQuery) (Page, error) {
	limit := clampPageLimit(q.Limit)
	query, args, err := buildPageQuery(animeID, q, limit)
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

// pageOrderComparator returns the row-value comparison operator and the
// ORDER BY direction for order. An unknown order is a builder error rather
// than a silent fall back to newest-first (design.md D1).
func pageOrderComparator(order Order) (compareOp, direction string, err error) {
	switch order {
	case OrderNewestFirst:
		return "<", "DESC", nil
	case OrderOldestFirst:
		return ">", "ASC", nil
	default:
		return "", "", fmt.Errorf("watchhistory: unknown page order %d", order)
	}
}

// buildPageQuery assembles the keyset query and its bind arguments for one
// page, requesting limit+1 rows so the caller can detect a further page
// without a second round trip. Every predicate on q is applied in SQL,
// ANDed by this one builder (design.md D1); animeID, when non-empty,
// additionally scopes the page to one anime.
func buildPageQuery(animeID string, q PageQuery, limit int) (string, []any, error) {
	compareOp, direction, err := pageOrderComparator(q.Order)
	if err != nil {
		return "", nil, err
	}

	query := "SELECT " + pageSelectColumns + " FROM watch_history"
	var conditions []string
	var args []any

	if animeID != "" {
		conditions = append(conditions, "anime_id = ?")
		args = append(args, animeID)
	}
	if q.Cycle > 0 {
		conditions = append(conditions, "cycle = ?")
		args = append(args, q.Cycle)
	}
	if search := strings.TrimSpace(q.Search); search != "" {
		conditions = append(conditions, "anime_name LIKE ? ESCAPE '\\'")
		args = append(args, "%"+escapeLikePattern(search)+"%")
	}
	if q.FromMS > 0 {
		conditions = append(conditions, "watched_at_ms >= ?")
		args = append(args, q.FromMS)
	}
	if q.ToMS > 0 {
		conditions = append(conditions, "watched_at_ms < ?")
		args = append(args, q.ToMS)
	}
	if len(q.AnimeIDs) > 0 {
		idsJSON, marshalErr := json.Marshal(q.AnimeIDs)
		if marshalErr != nil {
			return "", nil, fmt.Errorf("marshal watch-history anime ID filter: %w", marshalErr)
		}
		conditions = append(conditions, "anime_id IN (SELECT value FROM json_each(?))")
		args = append(args, string(idsJSON))
	}
	if q.Cursor != "" {
		c, decodeErr := decodePageCursor(q.Cursor)
		if decodeErr != nil {
			return "", nil, decodeErr
		}
		conditions = append(conditions, fmt.Sprintf("(watched_at_ms, id) %s (?, ?)", compareOp))
		args = append(args, c.WatchedAtMS, c.ID)
	}
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += fmt.Sprintf(" ORDER BY watched_at_ms %s, id %s LIMIT ?", direction, direction)
	return query, append(args, limit+1), nil
}

// escapeLikePattern escapes SQLite LIKE metacharacters -- '%', '_', and the
// escape character itself -- so Search matches its literal text rather than
// treating '%'/'_' as wildcards. Mirrors
// internal/notification/center's escapeLikePattern, which is unexported
// there, so this package keeps its own copy. Paired with the query's
// explicit ESCAPE '\' clause: SQLite's LIKE has no escape character by
// default.
func escapeLikePattern(raw string) string {
	replacer := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`)
	return replacer.Replace(raw)
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
