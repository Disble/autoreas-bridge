package anime

import (
	"sort"
	"strings"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/pathutil"
)

// LibraryRootMove is one active anime whose stored folder follows a library
// root change (ADR 027 D4): From is the folder under the old root, To keeps its
// whole relative part under the new root.
type LibraryRootMove struct {
	AnimeID        string `json:"animeId"`
	Name           string `json:"name"`
	From           string `json:"from"`
	To             string `json:"to"`
	BaseModifiedAt int64  `json:"baseModifiedAt"`
}

// LibraryRootKept is one active anime whose folder is outside the old root, so
// a root change leaves it as it is.
type LibraryRootKept struct {
	AnimeID string `json:"animeId"`
	Name    string `json:"name"`
	Folder  string `json:"folder"`
}

// LibraryRootPlan is what a library root change does to stored folders.
type LibraryRootPlan struct {
	Moves []LibraryRootMove `json:"moves"`
	Kept  []LibraryRootKept `json:"kept"`
}

// PlanLibraryRootChange decides which stored folders follow a change from
// oldRoot to newRoot. Only active animes are considered: inactive history keeps
// the folder it was recorded with, and files on disk are never touched. The
// plan is empty when there was no previous root, the root is cleared, or both
// name the same folder. Both lists are ordered by name.
func PlanLibraryRootChange(oldRoot, newRoot string, animes []contracts.MobileAnime) LibraryRootPlan {
	plan := LibraryRootPlan{Moves: []LibraryRootMove{}, Kept: []LibraryRootKept{}}
	from, to := normalizedRoot(oldRoot), strings.TrimRight(strings.TrimSpace(newRoot), `\/`)
	if from == "" || to == "" || strings.EqualFold(from, normalizedRoot(newRoot)) {
		return plan
	}
	for _, item := range animes {
		if item.Active != 1 || item.Folder == nil || strings.TrimSpace(*item.Folder) == "" {
			continue
		}
		relative := pathutil.RelativeFolder(oldRoot, *item.Folder)
		if relative == "" {
			plan.Kept = append(plan.Kept, LibraryRootKept{AnimeID: item.ID, Name: item.Name, Folder: *item.Folder})
			continue
		}
		plan.Moves = append(plan.Moves, LibraryRootMove{
			AnimeID:        item.ID,
			Name:           item.Name,
			From:           *item.Folder,
			To:             to + `\` + strings.ReplaceAll(relative, "/", `\`),
			BaseModifiedAt: item.ModifiedAt,
		})
	}
	sort.SliceStable(plan.Moves, func(i, j int) bool { return lessName(plan.Moves[i].Name, plan.Moves[j].Name) })
	sort.SliceStable(plan.Kept, func(i, j int) bool { return lessName(plan.Kept[i].Name, plan.Kept[j].Name) })
	return plan
}

// normalizedRoot compares roots the way RelativeFolder matches them: trimmed,
// `/`-separated, and without a trailing separator.
func normalizedRoot(root string) string {
	return strings.TrimRight(strings.ReplaceAll(strings.TrimSpace(root), `\`, "/"), "/")
}

// lessName orders anime names case-insensitively.
func lessName(a, b string) bool {
	return strings.ToLower(a) < strings.ToLower(b)
}
