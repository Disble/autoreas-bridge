package download

import (
	"context"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// noticeCalls records what the duration-notice seam was handed.
type noticeCalls struct {
	folders []string
	kinds   []*int
}

func (n *noticeCalls) EpisodeLanded(_ context.Context, folder string, kind *int, _ int, _, _ string) {
	n.folders = append(n.folders, folder)
	n.kinds = append(n.kinds, kind)
}

func TestNoticeEpisodeDurationHandsTheFolderAndTheStoredTypeOver(t *testing.T) {
	t.Parallel()

	folder := `D:\Anime\Show`
	kind := 0
	calls := &noticeCalls{}
	anime := contracts.MobileAnime{Folder: &folder, Kind: &kind}

	NewService(ServiceDeps{EpisodeDurationNotice: calls}).noticeEpisodeDuration(context.Background(), anime, 8)

	if len(calls.folders) != 1 {
		t.Fatalf("the landed episode is handed over exactly once, got %d", len(calls.folders))
	}
	if calls.folders[0] != folder {
		t.Errorf("folder: want %q, got %q", folder, calls.folders[0])
	}
	if calls.kinds[0] == nil || *calls.kinds[0] != kind {
		t.Errorf("the stored type must travel as it is stored, got %v", calls.kinds[0])
	}
}

func TestNoticeEpisodeDurationStaysSilentWithoutAWiringOrAFolder(t *testing.T) {
	t.Parallel()

	folder := `D:\Anime\Show`
	empty := ""

	for _, tc := range []struct {
		name  string
		deps  func(*noticeCalls) ServiceDeps
		anime contracts.MobileAnime
	}{
		{name: "no seam wired", deps: func(*noticeCalls) ServiceDeps { return ServiceDeps{} },
			anime: contracts.MobileAnime{Folder: &folder}},
		{name: "the anime has no folder", deps: func(c *noticeCalls) ServiceDeps {
			return ServiceDeps{EpisodeDurationNotice: c}
		}, anime: contracts.MobileAnime{}},
		{name: "the folder is empty", deps: func(c *noticeCalls) ServiceDeps {
			return ServiceDeps{EpisodeDurationNotice: c}
		}, anime: contracts.MobileAnime{Folder: &empty}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			calls := &noticeCalls{}
			NewService(tc.deps(calls)).noticeEpisodeDuration(context.Background(), tc.anime, 8)

			if len(calls.folders) != 0 {
				t.Errorf("nothing may be handed over here, got %v", calls.folders)
			}
		})
	}
}
