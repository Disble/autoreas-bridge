package domain

import (
	"testing"
	"time"
)

// TestApplyGradeResolvesEachSourceAndTimeOrderOnOneRow drives one intake row
// from ungraded through every grade rule: a first grade records and clears a
// skip, mobile may correct itself at the same rated_at (a retried delivery), a
// manual edit always wins and clears a skip, an older mobile grade is refused,
// and a newer mobile grade overwrites the manual one.
func TestApplyGradeResolvesEachSourceAndTimeOrderOnOneRow(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(1_700_000_000_000))
	assertFreshRowUngraded(t, sa)

	rated := time.UnixMilli(1_700_000_100_000)
	if !sa.ApplyGrade(4, GradeSourceMobileSync, rated) {
		t.Fatal("ApplyGrade on an empty cell must apply")
	}
	if sa.Grade != 4 || sa.GradeSource != GradeSourceMobileSync {
		t.Fatalf("grade=%d source=%q, want 4 from mobile_sync", sa.Grade, sa.GradeSource)
	}
	if sa.RatedAt == nil || !sa.RatedAt.Equal(rated) {
		t.Fatalf("RatedAt = %v, want %v", sa.RatedAt, rated)
	}
	if !sa.IsGraded() {
		t.Fatal("IsGraded must be true after a grade")
	}
	if !sa.ApplyGrade(6, GradeSourceMobileSync, rated) || sa.Grade != 6 {
		t.Fatalf("mobile correcting its own earlier grade must be allowed, grade=%d", sa.Grade)
	}

	assertManualGradeWinsAndClearsASkip(t, &sa, rated.Add(-time.Hour))
	manualAt := rated.Add(-time.Hour)
	if sa.ApplyGrade(2, GradeSourceMobileSync, manualAt.Add(-time.Millisecond)) {
		t.Fatal("a mobile grade older than the stored one must not overwrite it")
	}
	if sa.Grade != 5 || sa.GradeSource != GradeSourceManual || !sa.RatedAt.Equal(manualAt) {
		t.Fatalf("newer grade was clobbered: grade=%d source=%q ratedAt=%v", sa.Grade, sa.GradeSource, sa.RatedAt)
	}
	if !sa.ApplyGrade(2, GradeSourceMobileSync, manualAt.Add(time.Millisecond)) {
		t.Fatal("a newer mobile grade must overwrite a manual grade")
	}
	if sa.Grade != 2 || sa.GradeSource != GradeSourceMobileSync {
		t.Fatalf("newer mobile grade did not win: grade=%d source=%q", sa.Grade, sa.GradeSource)
	}
}

// assertFreshRowUngraded checks a new intake row reports ungraded and carries
// no grade, source, rated_at, or skip.
func assertFreshRowUngraded(t *testing.T, sa SeasonAnime) {
	t.Helper()

	if sa.IsGraded() {
		t.Fatal("a fresh intake row must be ungraded")
	}
	if sa.Grade != 0 || sa.GradeSource != "" || sa.RatedAt != nil || sa.SkipGrading {
		t.Fatalf("fresh row must have zero grade state: %+v", sa)
	}
}

// assertManualGradeWinsAndClearsASkip skips the row, then applies a manual
// grade rated before the stored mobile grade: a manual edit is live on the
// bridge, so it wins even over a mobile grade whose rated_at is later (a phone
// clock ahead of the bridge's), and grading clears the skip.
func assertManualGradeWinsAndClearsASkip(t *testing.T, sa *SeasonAnime, at time.Time) {
	t.Helper()

	sa.Skip()
	if !sa.SkipGrading {
		t.Fatal("Skip must set SkipGrading")
	}
	if !sa.ApplyGrade(5, GradeSourceManual, at) {
		t.Fatal("a manual grade must always win")
	}
	if sa.Grade != 5 || sa.GradeSource != GradeSourceManual {
		t.Fatalf("manual edit did not win: grade=%d source=%q", sa.Grade, sa.GradeSource)
	}
	if sa.SkipGrading {
		t.Fatal("grading must clear a prior skip")
	}
}
