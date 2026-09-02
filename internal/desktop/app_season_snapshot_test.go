package desktop

import (
	"testing"
	"time"

	"autoreas-bridge/internal/season/domain"
)

func TestActiveSeasonCandidatesIncludesOnlyLinkedRowsAndKeepsBridgeGrades(t *testing.T) {
	t.Parallel()

	ratedAt := time.UnixMilli(1_751_500_000_000)
	rows := []domain.SeasonAnime{
		{AnimeID: "anime-a", Grade: 4, GradeSource: domain.GradeSourceManual, RatedAt: &ratedAt},
		{AnimeID: "anime-b"},
		{AnimeID: "", Grade: 6, GradeSource: domain.GradeSourceManual, RatedAt: &ratedAt},
	}

	candidates := activeSeasonCandidates(rows)
	if len(candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2", len(candidates))
	}
	if candidates[0].AnimeID != "anime-a" || candidates[0].Grade == nil || *candidates[0].Grade != 4 || candidates[0].GradeSource != "bridge" {
		t.Fatalf("first candidate = %+v", candidates[0])
	}
	if candidates[1].AnimeID != "anime-b" || candidates[1].Grade != nil || candidates[1].GradeSource != "" {
		t.Fatalf("second candidate = %+v", candidates[1])
	}
}
