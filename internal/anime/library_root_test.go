package anime

import (
	"reflect"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// libraryAnime builds a served anime with a stored folder and OCC token.
func libraryAnime(id, name string, active int, folder string, modifiedAt int64) contracts.MobileAnime {
	return contracts.MobileAnime{ID: id, Name: name, Active: active, Folder: &folder, ModifiedAt: modifiedAt}
}

// TestPlanLibraryRootChangeMovesOnlyActiveAnimesUnderTheOldRoot pins ADR 027
// D4 against real stored shapes: an active anime under the old root moves with
// its whole subfolder, an active anime elsewhere is kept and listed, and
// inactive history or a folderless anime is never part of the plan.
func TestPlanLibraryRootChangeMovesOnlyActiveAnimesUnderTheOldRoot(t *testing.T) {
	t.Parallel()

	noFolder := contracts.MobileAnime{ID: "n", Name: "Shichisei no Subaru", Active: 1}
	animes := []contracts.MobileAnime{
		libraryAnime("y", "Yani Neko", 1, `D:\Anime\Yani Neko`, 10),
		libraryAnime("o", "One Pace", 1, `d:/anime/One Pace - Whole Cake Island\One Pace - Reverie\One Pace - Wano`, 20),
		libraryAnime("e", "Eureka", 1, `E:\Anime\Eureka`, 30),
		libraryAnime("e2", "eureka", 1, `G:\Eureka`, 35),
		libraryAnime("s", "Anime2 sibling", 1, `D:\Anime2\Sibling`, 40),
		libraryAnime("r", "Root itself", 1, `D:\Anime`, 50),
		libraryAnime("h", "Overlord", 0, `D:\Anime\Overlord`, 60),
		libraryAnime("b", "Blank", 1, "", 70),
		noFolder,
	}

	got := PlanLibraryRootChange(`D:\Anime\`, `F:\Anime\`, animes)

	wantMoves := []LibraryRootMove{
		{AnimeID: "o", Name: "One Pace", From: `d:/anime/One Pace - Whole Cake Island\One Pace - Reverie\One Pace - Wano`, To: `F:\Anime\One Pace - Whole Cake Island\One Pace - Reverie\One Pace - Wano`, BaseModifiedAt: 20},
		{AnimeID: "y", Name: "Yani Neko", From: `D:\Anime\Yani Neko`, To: `F:\Anime\Yani Neko`, BaseModifiedAt: 10},
	}
	wantKept := []LibraryRootKept{
		{AnimeID: "s", Name: "Anime2 sibling", Folder: `D:\Anime2\Sibling`},
		{AnimeID: "e", Name: "Eureka", Folder: `E:\Anime\Eureka`},
		{AnimeID: "e2", Name: "eureka", Folder: `G:\Eureka`},
		{AnimeID: "r", Name: "Root itself", Folder: `D:\Anime`},
	}
	if !reflect.DeepEqual(got.Moves, wantMoves) {
		t.Errorf("moves:\n got %+v\nwant %+v", got.Moves, wantMoves)
	}
	if !reflect.DeepEqual(got.Kept, wantKept) {
		t.Errorf("kept:\n got %+v\nwant %+v", got.Kept, wantKept)
	}
}

// TestPlanLibraryRootChangeIsEmptyWhenNothingChanges covers the roots that
// leave every folder alone: no previous root, a cleared root, and the same root
// written with another case or separator.
func TestPlanLibraryRootChangeIsEmptyWhenNothingChanges(t *testing.T) {
	t.Parallel()

	animes := []contracts.MobileAnime{libraryAnime("y", "Yani Neko", 1, `D:\Anime\Yani Neko`, 10)}
	for name, roots := range map[string][2]string{
		"no previous root": {"", `F:\Anime`},
		"cleared root":     {`D:\Anime`, "  "},
		"same root":        {`D:\Anime`, `d:/anime/`},
	} {
		if got := PlanLibraryRootChange(roots[0], roots[1], animes); len(got.Moves) != 0 || len(got.Kept) != 0 {
			t.Errorf("%s: want an empty plan, got %+v", name, got)
		}
	}
}
