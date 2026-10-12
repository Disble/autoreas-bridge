package download

import (
	"context"

	"autoreas-bridge/internal/api/contracts"
)

// EpisodeDurationNotice is the seam a download run uses to offer one episode that just landed to the
// duration notice.
//
// It is declared by the CONSUMER: this context knows only that it must be able to say "this episode
// landed in this folder, and this is the anime's stored type". It never learns what the notice does
// with it, so nothing here depends on the anime context. The implementation's side of the contract is
// to stay silent whenever it cannot decide, which is why the method returns nothing and cannot fail.
//
// A nil seam means no notice is ever raised — the same degradation every optional dependency in
// ServiceDeps takes.
type EpisodeDurationNotice interface {
	// EpisodeLanded reports the folder one episode just landed in, and the anime's stored type as
	// it is stored (nil meaning the type was never recorded).
	EpisodeLanded(ctx context.Context, folder string, kind *int)
}

// noticeEpisodeDuration offers a landed episode to the duration notice, after the rename and the
// flatten have left the file at the folder root.
//
// The folder is the anime's own and is already stored; the file inside it is not named here, because
// the notice reads the folder at the moment the file exists instead of trusting a name this run
// never had. It is best-effort by construction: an unwired seam, an anime without a folder and an
// empty folder all mean the same thing, that there is nothing to offer.
func (s *Service) noticeEpisodeDuration(ctx context.Context, anime contracts.MobileAnime) {
	if s.deps.EpisodeDurationNotice == nil || anime.Folder == nil || *anime.Folder == "" {
		return
	}
	s.deps.EpisodeDurationNotice.EpisodeLanded(ctx, *anime.Folder, anime.Kind)
}
