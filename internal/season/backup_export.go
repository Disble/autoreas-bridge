package season

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
)

// seasonRecord is the JSONL wire shape for one seasons row. Field names are
// English snake_case matching the column names -- this is the backup
// bundle's wire contract. Nullable columns round-trip as pointers so a NULL
// stays distinguishable from a zero value.
type seasonRecord struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	MinApprovalGrade     int64  `json:"min_approval_grade"`
	Slots                int64  `json:"slots"`
	Status               string `json:"status"`
	SelectionConfirmedAt *int64 `json:"selection_confirmed_at"`
	AppliedAt            *int64 `json:"applied_at"`
	ClosedAt             *int64 `json:"closed_at"`
	OrderingDraftJSON    string `json:"ordering_draft_json"`
	CreatedAt            int64  `json:"created_at"`
}

// seasonAnimeRecord is the JSONL wire shape for one season_animes row.
type seasonAnimeRecord struct {
	ID                  string  `json:"id"`
	SeasonID            string  `json:"season_id"`
	RawName             string  `json:"raw_name"`
	MatchStatus         string  `json:"match_status"`
	MatchedSlug         *string `json:"matched_slug"`
	MatchCandidatesJSON *string `json:"match_candidates_json"`
	Availability        string  `json:"availability"`
	FirstAvailableAt    *int64  `json:"first_available_at"`
	AvailableEpisodes   int64   `json:"available_episodes"`
	AnimeID             *string `json:"anime_id"`
	PremiereGrade       *int64  `json:"premiere_grade"`
	GradeSource         *string `json:"grade_source"`
	PostSeasonGrade     *int64  `json:"post_season_grade"`
	RatedAt             *int64  `json:"rated_at"`
	SkipGrading         int64   `json:"skip_grading"`
	Consideration       string  `json:"consideration"`
	LastCheckedAt       *int64  `json:"last_checked_at"`
	CreatedAt           int64   `json:"created_at"`
}

// ExportSeasons returns a backup export function that streams every seasons
// row as one JSONL line, ordered by id for a reproducible bundle. No
// accumulation: each row is encoded and written to w before the next row is
// read.
func ExportSeasons(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		rows, err := db.QueryContext(ctx, `
			SELECT id, name, min_approval_grade, slots, status,
			       selection_confirmed_at, applied_at, closed_at, ordering_draft_json, created_at
			FROM seasons
			ORDER BY id
		`)
		if err != nil {
			return 0, fmt.Errorf("query seasons for export: %w", err)
		}
		// Read-only query: rows.Err() below covers iteration failures, so a
		// Close error here carries nothing actionable.
		defer func() { _ = rows.Close() }()

		enc := json.NewEncoder(w)
		count := 0
		for rows.Next() {
			var (
				rec                  seasonRecord
				selectionConfirmedAt sql.NullInt64
				appliedAt            sql.NullInt64
				closedAt             sql.NullInt64
			)
			if err := rows.Scan(&rec.ID, &rec.Name, &rec.MinApprovalGrade, &rec.Slots, &rec.Status,
				&selectionConfirmedAt, &appliedAt, &closedAt, &rec.OrderingDraftJSON, &rec.CreatedAt); err != nil {
				return count, fmt.Errorf("scan season for export: %w", err)
			}
			rec.SelectionConfirmedAt = nullInt64Ptr(selectionConfirmedAt)
			rec.AppliedAt = nullInt64Ptr(appliedAt)
			rec.ClosedAt = nullInt64Ptr(closedAt)

			if err := enc.Encode(rec); err != nil {
				return count, fmt.Errorf("encode season for export: %w", err)
			}
			count++
		}
		if err := rows.Err(); err != nil {
			return count, fmt.Errorf("iterate seasons for export: %w", err)
		}
		return count, nil
	}
}

// ExportSeasonAnimes returns a backup export function that streams every
// season_animes row as one JSONL line, ordered by id for a reproducible
// bundle. No accumulation: each row is encoded and written to w before the
// next row is read.
func ExportSeasonAnimes(db *sql.DB) func(context.Context, io.Writer) (int, error) {
	return func(ctx context.Context, w io.Writer) (int, error) {
		rows, err := db.QueryContext(ctx, `
			SELECT id, season_id, raw_name, match_status, matched_slug,
			       match_candidates_json, availability, first_available_at, available_episodes,
			       anime_id, premiere_grade, grade_source, post_season_grade, rated_at,
			       skip_grading, consideration, last_checked_at, created_at
			FROM season_animes
			ORDER BY id
		`)
		if err != nil {
			return 0, fmt.Errorf("query season animes for export: %w", err)
		}
		// Read-only query: rows.Err() below covers iteration failures, so a
		// Close error here carries nothing actionable.
		defer func() { _ = rows.Close() }()

		enc := json.NewEncoder(w)
		count := 0
		for rows.Next() {
			var (
				rec                 seasonAnimeRecord
				matchedSlug         sql.NullString
				matchCandidatesJSON sql.NullString
				firstAvailableAt    sql.NullInt64
				animeID             sql.NullString
				premiereGrade       sql.NullInt64
				gradeSource         sql.NullString
				postSeasonGrade     sql.NullInt64
				ratedAt             sql.NullInt64
				lastCheckedAt       sql.NullInt64
			)
			if err := rows.Scan(&rec.ID, &rec.SeasonID, &rec.RawName, &rec.MatchStatus, &matchedSlug,
				&matchCandidatesJSON, &rec.Availability, &firstAvailableAt, &rec.AvailableEpisodes,
				&animeID, &premiereGrade, &gradeSource, &postSeasonGrade, &ratedAt,
				&rec.SkipGrading, &rec.Consideration, &lastCheckedAt, &rec.CreatedAt); err != nil {
				return count, fmt.Errorf("scan season anime for export: %w", err)
			}
			rec.MatchedSlug = nullStringPtr(matchedSlug)
			rec.MatchCandidatesJSON = nullStringPtr(matchCandidatesJSON)
			rec.FirstAvailableAt = nullInt64Ptr(firstAvailableAt)
			rec.AnimeID = nullStringPtr(animeID)
			rec.PremiereGrade = nullInt64Ptr(premiereGrade)
			rec.GradeSource = nullStringPtr(gradeSource)
			rec.PostSeasonGrade = nullInt64Ptr(postSeasonGrade)
			rec.RatedAt = nullInt64Ptr(ratedAt)
			rec.LastCheckedAt = nullInt64Ptr(lastCheckedAt)

			if err := enc.Encode(rec); err != nil {
				return count, fmt.Errorf("encode season anime for export: %w", err)
			}
			count++
		}
		if err := rows.Err(); err != nil {
			return count, fmt.Errorf("iterate season animes for export: %w", err)
		}
		return count, nil
	}
}

// nullInt64Ptr converts a nullable SQLite integer column to a JSON-friendly
// pointer, so an absent value round-trips as null rather than 0.
func nullInt64Ptr(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	value := v.Int64
	return &value
}

// nullStringPtr converts a nullable SQLite text column to a JSON-friendly
// pointer, so an absent value round-trips as null rather than "".
func nullStringPtr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	value := v.String
	return &value
}
