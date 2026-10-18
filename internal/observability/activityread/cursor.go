package activityread

import (
	"cmp"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// The paged reads merge several tables into one newest-first order: time
// DESC, then source rank DESC, then id DESC. A cursor is the position of the
// last item a page returned; each table reads only the rows strictly after
// it, so pages never repeat or skip a row, even when rows share a millisecond.

// idWidth zero-pads integer ids so their text order is their numeric order.
const idWidth = 20

// cursor is one position in the merged order.
type cursor struct {
	atMS int64
	rank int
	key  string
}

// item is one merged row with its position.
type item[T any] struct {
	pos   cursor
	value T
}

// intKey returns the order key of an integer id.
func intKey(id int64) string {
	return fmt.Sprintf("%0*d", idWidth, id)
}

// formatID renders an integer id as the decimal string a view carries.
func formatID(id int64) string {
	return strconv.FormatInt(id, 10)
}

// encode renders c as an opaque cursor string.
func (c cursor) encode() string {
	return strconv.FormatInt(c.atMS, 10) + "." + strconv.Itoa(c.rank) + "." + c.key
}

// parseCursor decodes a cursor string; an empty string is the first page.
func parseCursor(raw string) (*cursor, error) {
	if raw == "" {
		return nil, nil
	}
	parts := strings.SplitN(raw, ".", 3)
	if len(parts) != 3 || parts[2] == "" {
		return nil, fmt.Errorf("activityread: malformed cursor %q", raw)
	}
	atMS, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("activityread: malformed cursor %q: %w", raw, err)
	}
	rank, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, fmt.Errorf("activityread: malformed cursor %q: %w", raw, err)
	}
	return &cursor{atMS: atMS, rank: rank, key: parts[2]}, nil
}

// keyset returns the predicate selecting the rows of one source (with rank)
// strictly after c. intID says the id column is an integer, so the cursor
// key is compared as a number.
func keyset(c *cursor, rank int, timeCol, idCol string, intID bool) (string, []any, error) {
	if c == nil {
		return "1=1", nil, nil
	}
	switch {
	case rank < c.rank:
		return timeCol + " <= ?", []any{c.atMS}, nil
	case rank > c.rank:
		return timeCol + " < ?", []any{c.atMS}, nil
	}
	var id any = c.key
	if intID {
		n, err := strconv.ParseInt(c.key, 10, 64)
		if err != nil {
			return "", nil, fmt.Errorf("activityread: malformed cursor id %q: %w", c.key, err)
		}
		id = n
	}
	clause := timeCol + " <= ? AND (" + timeCol + " < ? OR " + idCol + " < ?)"
	return clause, []any{c.atMS, c.atMS, id}, nil
}

// comparePositions orders positions newest first: negative when a comes
// before b, positive when a comes after b.
func comparePositions(a, b cursor) int {
	return cmp.Or(cmp.Compare(b.atMS, a.atMS), cmp.Compare(b.rank, a.rank), cmp.Compare(b.key, a.key))
}

// clampLimit applies the default and the cap to a requested page size.
func clampLimit(limit int) int {
	if limit <= 0 {
		return DefaultPageLimit
	}
	return min(limit, MaxPageLimit)
}

// takePage sorts the merged rows newest first and keeps limit of them. The
// next cursor is set only when more rows remain. Each source must have read
// limit+1 rows after the cursor for the page to be exact.
func takePage[T any](items []item[T], limit int) ([]T, string) {
	slices.SortFunc(items, func(a, b item[T]) int { return comparePositions(a.pos, b.pos) })
	next := ""
	if len(items) > limit {
		items = items[:limit]
		next = items[limit-1].pos.encode()
	}
	values := make([]T, len(items))
	for i, it := range items {
		values[i] = it.value
	}
	return values, next
}
