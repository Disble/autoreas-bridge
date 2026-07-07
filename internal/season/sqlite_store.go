package season

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"autoreas-bridge/internal/season/domain"
)

// SQLiteStore implements Repository on top of the shared bridge.db connection
// (the bridge SQLite-store convention: constructor injection over an
// already-bootstrapped *sql.DB). Timestamps are stored as epoch milliseconds,
// matching the bridge's existing millisecond-timestamp convention.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore wraps an already-bootstrapped bridge.db connection. The seasons
// and season_animes tables must already exist (created via SchemaTables during
// initializeBridgeDB).
func NewSQLiteStore(db *sql.DB) *SQLiteStore {
	return &SQLiteStore{db: db}
}

// CreateSeason inserts a new season. The seasons partial unique index on
// status='open' rejects a second concurrently-open season at the storage layer.
func (s *SQLiteStore) CreateSeason(ctx context.Context, season domain.Season) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO seasons
			(id, name, min_approval_grade, slots, status,
			 selection_confirmed_at, applied_at, closed_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		season.ID, season.Name, season.MinApprovalGrade, season.Slots, string(season.Status),
		millisPtr(season.SelectionConfirmedAt), millisPtr(season.AppliedAt), millisPtr(season.ClosedAt),
		season.CreatedAt.UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("create season %q: %w", season.ID, err)
	}
	return nil
}

// ActiveSeason returns the single open season, or (nil, nil) when none is open.
func (s *SQLiteStore) ActiveSeason(ctx context.Context) (*domain.Season, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, min_approval_grade, slots, status,
		       selection_confirmed_at, applied_at, closed_at, created_at
		FROM seasons WHERE status = 'open' LIMIT 1`)
	season, err := scanSeason(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query active season: %w", err)
	}
	return season, nil
}

// UpdateSeason persists the mutable season fields (parameters, status, milestones).
func (s *SQLiteStore) UpdateSeason(ctx context.Context, season domain.Season) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE seasons SET
			name = ?, min_approval_grade = ?, slots = ?, status = ?,
			selection_confirmed_at = ?, applied_at = ?, closed_at = ?
		WHERE id = ?`,
		season.Name, season.MinApprovalGrade, season.Slots, string(season.Status),
		millisPtr(season.SelectionConfirmedAt), millisPtr(season.AppliedAt), millisPtr(season.ClosedAt),
		season.ID,
	)
	if err != nil {
		return fmt.Errorf("update season %q: %w", season.ID, err)
	}
	return nil
}

// CreateSeasonAnime inserts a new intake row.
func (s *SQLiteStore) CreateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO season_animes
			(id, season_id, raw_name, match_status, matched_slug,
			 match_candidates_json, availability, anime_id,
			 premiere_grade, grade_source, rated_at, skip_grading, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		sa.ID, sa.SeasonID, sa.RawName, string(sa.MatchStatus), sa.MatchedSlug,
		marshalCandidates(sa.Candidates), string(sa.Availability), sa.AnimeID,
		gradePtr(sa.Grade), gradeSourcePtr(sa.GradeSource), millisPtr(sa.RatedAt), boolToInt(sa.SkipGrading),
		sa.CreatedAt.UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("create season anime %q: %w", sa.ID, err)
	}
	return nil
}

// ListSeasonAnimes returns a season's intake rows in creation order.
func (s *SQLiteStore) ListSeasonAnimes(ctx context.Context, seasonID string) ([]domain.SeasonAnime, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, season_id, raw_name, match_status, matched_slug,
		       match_candidates_json, availability, anime_id,
		       premiere_grade, grade_source, rated_at, skip_grading, created_at
		FROM season_animes WHERE season_id = ? ORDER BY created_at, id`, seasonID)
	if err != nil {
		return nil, fmt.Errorf("list season animes for %q: %w", seasonID, err)
	}
	defer rows.Close()

	var out []domain.SeasonAnime
	for rows.Next() {
		sa, err := scanSeasonAnime(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sa)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate season animes: %w", err)
	}
	return out, nil
}

// SeasonAnimeByID returns one intake row, or (nil, nil) when absent.
func (s *SQLiteStore) SeasonAnimeByID(ctx context.Context, id string) (*domain.SeasonAnime, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, season_id, raw_name, match_status, matched_slug,
		       match_candidates_json, availability, anime_id,
		       premiere_grade, grade_source, rated_at, skip_grading, created_at
		FROM season_animes WHERE id = ?`, id)
	sa, err := scanSeasonAnime(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query season anime %q: %w", id, err)
	}
	return sa, nil
}

// UpdateSeasonAnime persists the mutable intake/matching fields.
func (s *SQLiteStore) UpdateSeasonAnime(ctx context.Context, sa domain.SeasonAnime) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE season_animes SET
			match_status = ?, matched_slug = ?, match_candidates_json = ?,
			availability = ?, anime_id = ?,
			premiere_grade = ?, grade_source = ?, rated_at = ?, skip_grading = ?
		WHERE id = ?`,
		string(sa.MatchStatus), sa.MatchedSlug, marshalCandidates(sa.Candidates),
		string(sa.Availability), sa.AnimeID,
		gradePtr(sa.Grade), gradeSourcePtr(sa.GradeSource), millisPtr(sa.RatedAt), boolToInt(sa.SkipGrading),
		sa.ID,
	)
	if err != nil {
		return fmt.Errorf("update season anime %q: %w", sa.ID, err)
	}
	return nil
}

func scanSeasonAnime(row rowScanner) (*domain.SeasonAnime, error) {
	var (
		sa           domain.SeasonAnime
		matchStatus  string
		matchedSlug  sql.NullString
		candidates   sql.NullString
		availability string
		animeID      sql.NullString
		grade        sql.NullInt64
		gradeSource  sql.NullString
		ratedAt      sql.NullInt64
		skipGrading  int64
		createdAt    int64
	)
	if err := row.Scan(&sa.ID, &sa.SeasonID, &sa.RawName, &matchStatus, &matchedSlug,
		&candidates, &availability, &animeID,
		&grade, &gradeSource, &ratedAt, &skipGrading, &createdAt); err != nil {
		return nil, err
	}
	sa.MatchStatus = domain.MatchStatus(matchStatus)
	sa.MatchedSlug = matchedSlug.String
	sa.Availability = domain.Availability(availability)
	sa.AnimeID = animeID.String
	sa.Candidates = unmarshalCandidates(candidates.String)
	sa.Grade = int(grade.Int64)
	sa.GradeSource = domain.GradeSource(gradeSource.String)
	sa.RatedAt = timePtr(ratedAt)
	sa.SkipGrading = skipGrading != 0
	sa.CreatedAt = time.UnixMilli(createdAt)
	return &sa, nil
}

// gradePtr stores a 1–6 grade, or NULL when ungraded (0).
func gradePtr(grade int) any {
	if grade == 0 {
		return nil
	}
	return grade
}

// gradeSourcePtr stores a non-empty source, or NULL when unset.
func gradeSourcePtr(src domain.GradeSource) any {
	if src == "" {
		return nil
	}
	return string(src)
}

// boolToInt maps a bool to the SQLite 0/1 integer convention.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func marshalCandidates(c []domain.MatchCandidate) string {
	if len(c) == 0 {
		return ""
	}
	b, err := json.Marshal(c)
	if err != nil {
		return ""
	}
	return string(b)
}

func unmarshalCandidates(raw string) []domain.MatchCandidate {
	if raw == "" {
		return nil
	}
	var c []domain.MatchCandidate
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil
	}
	return c
}

// rowScanner abstracts *sql.Row / *sql.Rows for scanSeason.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanSeason(row rowScanner) (*domain.Season, error) {
	var (
		s         domain.Season
		status    string
		selection sql.NullInt64
		applied   sql.NullInt64
		closed    sql.NullInt64
		createdAt int64
	)
	if err := row.Scan(&s.ID, &s.Name, &s.MinApprovalGrade, &s.Slots, &status,
		&selection, &applied, &closed, &createdAt); err != nil {
		return nil, err
	}
	s.Status = domain.Status(status)
	s.SelectionConfirmedAt = timePtr(selection)
	s.AppliedAt = timePtr(applied)
	s.ClosedAt = timePtr(closed)
	s.CreatedAt = time.UnixMilli(createdAt)
	return &s, nil
}

// millisPtr converts an optional time to a nullable epoch-ms argument.
func millisPtr(t *time.Time) any {
	if t == nil {
		return nil
	}
	return t.UnixMilli()
}

// timePtr converts a nullable epoch-ms column to an optional time.
func timePtr(n sql.NullInt64) *time.Time {
	if !n.Valid {
		return nil
	}
	t := time.UnixMilli(n.Int64)
	return &t
}

// Compile-time assertion: SQLiteStore must satisfy Repository.
var _ Repository = (*SQLiteStore)(nil)
