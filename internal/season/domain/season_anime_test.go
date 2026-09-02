package domain

import (
	"testing"
	"time"
)

func TestApplyGradeOnEmptyCellRecords(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(1_700_000_000_000))
	rated := time.UnixMilli(1_700_000_100_000)

	if !sa.ApplyGrade(4, GradeSourceMobileSync, rated) {
		t.Fatal("ApplyGrade on an empty cell must apply")
	}
	if sa.Grade != 4 {
		t.Fatalf("Grade = %d, want 4", sa.Grade)
	}
	if sa.GradeSource != GradeSourceMobileSync {
		t.Fatalf("GradeSource = %q, want mobile_sync", sa.GradeSource)
	}
	if sa.RatedAt == nil || !sa.RatedAt.Equal(rated) {
		t.Fatalf("RatedAt = %v, want %v", sa.RatedAt, rated)
	}
	if !sa.IsGraded() {
		t.Fatal("IsGraded must be true after a grade")
	}
}

func TestApplyGradeManualWinsAndFlipsSource(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(0))
	sa.ApplyGrade(3, GradeSourceMobileSync, time.UnixMilli(1))

	if !sa.ApplyGrade(5, GradeSourceManual, time.UnixMilli(2)) {
		t.Fatal("a manual grade must always win")
	}
	if sa.Grade != 5 || sa.GradeSource != GradeSourceManual {
		t.Fatalf("manual edit did not win: grade=%d source=%q", sa.Grade, sa.GradeSource)
	}
}

func TestApplyGradeMobileRejectedWhenManualPresent(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(0))
	sa.ApplyGrade(5, GradeSourceManual, time.UnixMilli(1))

	if sa.ApplyGrade(2, GradeSourceMobileSync, time.UnixMilli(2)) {
		t.Fatal("mobile_sync must not overwrite a manual grade")
	}
	if sa.Grade != 5 || sa.GradeSource != GradeSourceManual {
		t.Fatalf("manual grade was clobbered: grade=%d source=%q", sa.Grade, sa.GradeSource)
	}
}

func TestApplyGradeMobileSelfOverwriteAllowed(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(0))
	sa.ApplyGrade(3, GradeSourceMobileSync, time.UnixMilli(1))

	if !sa.ApplyGrade(6, GradeSourceMobileSync, time.UnixMilli(2)) {
		t.Fatal("mobile correcting its own earlier grade must be allowed")
	}
	if sa.Grade != 6 {
		t.Fatalf("Grade = %d, want 6", sa.Grade)
	}
}

func TestApplyGradeClearsPriorSkip(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(0))
	sa.Skip()
	if !sa.SkipGrading {
		t.Fatal("Skip must set SkipGrading")
	}
	sa.ApplyGrade(4, GradeSourceManual, time.UnixMilli(1))
	if sa.SkipGrading {
		t.Fatal("grading must clear a prior skip")
	}
}

func TestNewSeasonAnimeIsUngraded(t *testing.T) {
	sa := NewSeasonAnime("sa-1", "season-1", "Anime", time.UnixMilli(0))
	if sa.IsGraded() {
		t.Fatal("a fresh intake row must be ungraded")
	}
	if sa.Grade != 0 || sa.GradeSource != "" || sa.RatedAt != nil || sa.SkipGrading {
		t.Fatalf("fresh row must have zero grade state: %+v", sa)
	}
}
