package desktop

import (
	"context"
	"fmt"
	"strings"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/api/contracts"
)

// LibraryRootChangePreview is what saving a new library root would do to stored folders
// (ADR 027 D4). Message is set only when the preview could not be computed.
type LibraryRootChangePreview struct {
	OldRoot string                  `json:"oldRoot"`
	Moves   []anime.LibraryRootMove `json:"moves"`
	Kept    []anime.LibraryRootKept `json:"kept"`
	Message string                  `json:"message,omitempty"`
}

// PreviewLibraryRootChange lists the active animes whose stored folder would follow a change to
// newRoot, and the active animes outside the current root that stay as they are. Options shows
// it for confirmation before calling SetLibraryRoot.
func (a *App) PreviewLibraryRootChange(newRoot string) LibraryRootChangePreview {
	oldRoot, plan, err := a.libraryRootPlan(a.seasonCtx(), newRoot)
	if err != nil {
		return LibraryRootChangePreview{Moves: []anime.LibraryRootMove{}, Kept: []anime.LibraryRootKept{}, Message: err.Error()}
	}
	return LibraryRootChangePreview{OldRoot: oldRoot, Moves: plan.Moves, Kept: plan.Kept}
}

// libraryRootPlan reads the current root and every anime, and plans the change to newRoot.
// Without an anime query there is nothing to move.
func (a *App) libraryRootPlan(ctx context.Context, newRoot string) (string, anime.LibraryRootPlan, error) {
	oldRoot, err := a.libraryRoot(ctx)
	if err != nil {
		return "", anime.LibraryRootPlan{}, fmt.Errorf("read library root: %w", err)
	}
	if a.animeQuery == nil {
		return oldRoot, anime.PlanLibraryRootChange(oldRoot, newRoot, nil), nil
	}
	animes, err := a.animeQuery.ListMobileAnimes(ctx)
	if err != nil {
		return "", anime.LibraryRootPlan{}, fmt.Errorf("list animes: %w", err)
	}
	return oldRoot, anime.PlanLibraryRootChange(oldRoot, newRoot, animes), nil
}

// rebaseActiveFolders rewrites each planned folder through the editor's write path, one anime at
// a time with its own OCC base, so every rewrite is a normal change Mobile pulls. Any failure is
// reported by anime name, and the caller then keeps the old root.
func (a *App) rebaseActiveFolders(ctx context.Context, newRoot string) error {
	_, plan, err := a.libraryRootPlan(ctx, newRoot)
	if err != nil {
		return err
	}
	if len(plan.Moves) == 0 {
		return nil
	}
	if a.animeEditorWrite == nil {
		return fmt.Errorf("anime editor unavailable; the library root was not changed")
	}
	var failed []string
	for _, move := range plan.Moves {
		result, err := a.animeEditorWrite.Save(ctx, anime.SaveAnimeEditorCommand{
			AnimeID:        move.AnimeID,
			BaseModifiedAt: move.BaseModifiedAt,
			Patch:          anime.EditorPatch{Folder: anime.EditorNullableStringPatch{Present: true, Value: move.To}},
		})
		if err != nil || result.Outcome != contracts.AnimePatchOutcomeApplied {
			failed = append(failed, move.Name)
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("updated %d of %d active animes; could not update %s, so the library root was not changed",
			len(plan.Moves)-len(failed), len(plan.Moves), strings.Join(failed, ", "))
	}
	return nil
}
