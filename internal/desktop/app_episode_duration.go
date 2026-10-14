package desktop

import (
	"database/sql"
	"time"

	"autoreas-bridge/internal/anime/duration/probe"
	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/anime/lengths"
	"autoreas-bridge/internal/anime/media"
	"autoreas-bridge/internal/anime/notice"
	"autoreas-bridge/internal/download/config"
	"autoreas-bridge/internal/notification"
)

// newEpisodeDurationNotice builds the coordination that reports a landed episode whose runtime is out
// of the ordinary.
//
// The extension set is the download pipeline's own and not a list of its own, so the files this notice
// can see are exactly the files that pipeline counts as episodes. The probe is ffprobe as found on
// PATH: when it is absent the probe fails, the reading is unavailable, and the notice stays silent,
// which is the documented degradation rather than an error the user has to see.
func newEpisodeDurationNotice(notifier notification.Notifier) *notice.Coordinator {
	return notice.New(media.New(config.VideoFileExtensions), probe.NewFFProbe(""), notifier)
}

// newTodayMarks builds the source of Today's long-episode marks: stored durations only, read through
// the shared read model, so opening Today never reads a folder or measures a file (analysis D7).
func newTodayMarks(db *sql.DB) *lengths.Today {
	return lengths.NewToday(episodes.NewStore(db, time.Now))
}

// newLandedEpisodeNotice builds the coordination the download run offers every landed episode. Besides
// the notice, it stores each reading of a landed file as that episode's duration when the episode has
// none yet (analysis D3). Without a database it is the notice alone.
func newLandedEpisodeNotice(notifier notification.Notifier, db *sql.DB, wake func()) *notice.Coordinator {
	coordinator := newEpisodeDurationNotice(notifier)
	if db == nil {
		return coordinator
	}
	return coordinator.WithRecorder(episodes.NewStore(db, time.Now).OnPendingMarked(wake))
}
