package desktop

import (
	"context"

	"autoreas-bridge/internal/notification/center"
)

// clipboardCopyIntent is the clipboard.copy handler: it writes the text frozen into the pressed
// action's args to the desktop clipboard, through the same a.copyText seam CopyAnimePage and
// CopyAnimeFolder already use (app_desktop_actions.go), which defaults to
// wruntime.ClipboardSetText at the composition root.
//
// It copies the FROZEN value and re-derives nothing. That is the whole point of the PendingIntent
// model here: a jdownloader_offline notification names hoster links found during a run that ended
// days ago, and a link resolved fresh at press time would be a different link -- or, after the
// hoster rotated it, no link at all.
//
// A token with nothing to copy maps onto the closed refusal set as target_missing, exactly as
// navigationOpenIntent does for a missing route, rather than clearing whatever the user already
// had on their clipboard.
func (a *App) clipboardCopyIntent(ctx context.Context, args map[string]string) error {
	text := args[center.ArgKeyText]
	if text == "" {
		return center.ErrTargetMissing
	}
	return a.copyText(ctx, text)
}
