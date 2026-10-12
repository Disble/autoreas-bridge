package desktop

import (
	"autoreas-bridge/internal/anime/duration/probe"
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
//
// It returns the concrete coordination because two seams consume it: the download run offers it every
// episode that lands, and the episode service asks it for the marks of a day. It is stateless, so a
// single value serves both.
func newEpisodeDurationNotice(notifier notification.Notifier) *notice.Coordinator {
	return notice.New(media.New(config.VideoFileExtensions), probe.NewFFProbe(""), notifier)
}
