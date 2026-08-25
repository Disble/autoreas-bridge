package center

import (
	"context"
	"sort"
)

// Registered intent keys, shared between the composition root
// (app_notification_center.go) and any producer that freezes an action's
// Intent field (Slice 6). Declaring the literal once here means a typo can
// never silently produce an action that resolves to nothing. There is
// deliberately no "download.retry_run" constant: the download service
// exposes only RunOnce and RunAnime (internal/download/service.go:199,231).
const (
	// IntentDownloadRunAnime resolves to download.Service.RunAnime.
	IntentDownloadRunAnime = "download.run_anime"
	// IntentScheduleRunMissedNow resolves to the same scheduler call behind
	// the pre-existing RunMissedScheduleNow Wails binding.
	IntentScheduleRunMissedNow = "schedule.run_missed_now"
	// IntentScheduleIgnoreMissed resolves to the same scheduler call behind
	// the pre-existing IgnoreMissedSchedule Wails binding.
	IntentScheduleIgnoreMissed = "schedule.ignore_missed"
	// IntentClipboardCopy resolves to the desktop clipboard writer, copying
	// the text frozen under ArgKeyText. It is the intent behind the "Copy
	// hoster N" actions a hoster-blocked row offers (design-canvas
	// Anatomy.dc.html) -- the verb that row gets INSTEAD of a retry, because
	// re-running an anime whose downloader is still offline only reproduces
	// the block.
	IntentClipboardCopy = "clipboard.copy"
	// IntentNavigationOpen resolves to a frontend route change, addressed by
	// the "route" key of the action's frozen args. It is the intent behind a
	// whole-notification "Open Downloads" button (design-canvas
	// Intents.dc.html), and the only registered intent whose handler runs no
	// backend operation at all -- it hands the press to the delivery layer.
	IntentNavigationOpen = "navigation.open"
	// IntentSeasonDownloadNow resolves to the same manual season download the
	// Daily Board's own "Download now" button triggers.
	//
	// It is registered because season.past_download_window is the one notice
	// whose body names an action the user cannot otherwise reach from it: the
	// batch missed today's scheduled window, so nothing will download it
	// automatically, and the Daily Board banner that carries the button is
	// ephemeral local state cleared on navigation. The durable record was left
	// telling the user to do something with no way to do it.
	//
	// Single-fire like IntentScheduleRunMissedNow, and for the same reason: it
	// settles one moment, and once that batch has downloaded the moment is
	// closed.
	IntentSeasonDownloadNow = "season.download_now"
)

// Frozen-args keys, declared beside the intents that read them for the same
// reason the intent keys are: a producer freezes an argument here and a
// handler reads it back in the composition root, so a typo on either side
// would otherwise produce an action that resolves but does nothing. Only the
// keys with a producer in another package live here.
const (
	// ArgKeyRoute is where IntentNavigationOpen reads its destination route.
	ArgKeyRoute = "route"
	// ArgKeyAnimeID is where IntentDownloadRunAnime reads its target anime.
	ArgKeyAnimeID = "animeId"
	// ArgKeyText is where IntentClipboardCopy reads the text to copy. A hoster
	// URL lands here when the notification is WRITTEN and is copied verbatim
	// at press time -- the run that produced it is long over, so a link
	// re-derived later would be a different link.
	ArgKeyText = "text"
)

// StaticRegistry is the default IntentRegistry: an explicit map filled at
// the composition root (app_notification_center.go), never from inside this
// package -- that is what keeps center from importing internal/download and
// recreating notification->download->notification. Shape precedent:
// download.StaticRegistry (internal/download/registry.go). An empty
// StaticRegistry is a valid, tested state in which every press refuses with
// intent_unregistered -- the Slice 5 kill switch.
type StaticRegistry struct {
	handlers map[string]IntentHandler
}

// NewStaticRegistry returns an empty StaticRegistry ready for Register calls.
func NewStaticRegistry() *StaticRegistry {
	return &StaticRegistry{handlers: make(map[string]IntentHandler)}
}

// Register binds handler to intent. A later Register call for the same key
// replaces the earlier one.
func (r *StaticRegistry) Register(intent string, handler IntentHandler) {
	r.handlers[intent] = handler
}

// Resolve returns the handler bound to intent, or (nil, false) when no
// handler is registered under that key -- including on a zero-registration
// registry, which never panics.
func (r *StaticRegistry) Resolve(intent string) (IntentHandler, bool) {
	handler, found := r.handlers[intent]
	return handler, found
}

// Keys returns the registered intent keys, sorted. Exists so the mandated
// test "download.retry_run is absent from the registry" can assert on live
// state rather than on a source grep.
func (r *StaticRegistry) Keys() []string {
	keys := make([]string, 0, len(r.handlers))
	for key := range r.handlers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// singleFireHandler adapts a plain function to a non-repeatable
// IntentHandler -- every intent registered today uses this (single-fire
// default, notification-actions spec).
type singleFireHandler struct {
	fn func(ctx context.Context, args map[string]string) error
}

// Execute delegates to the wrapped function.
func (h singleFireHandler) Execute(ctx context.Context, args map[string]string) error {
	return h.fn(ctx, args)
}

// Repeatable is always false: SingleFireFunc only ever adapts single-fire
// operations.
func (singleFireHandler) Repeatable() bool { return false }

// SingleFireFunc adapts a plain function to a non-repeatable IntentHandler.
func SingleFireFunc(fn func(ctx context.Context, args map[string]string) error) IntentHandler {
	return singleFireHandler{fn: fn}
}

// repeatableHandler adapts a plain function to a repeatable IntentHandler:
// one whose second press is as meaningful as its first.
//
// The distinction is not cosmetic. `Executor` stamps every executed action and
// refuses a second press with already_executed, which is right for an operation
// that changes the world -- running an anime again after it already ran is a
// second download, not a repeat. It is wrong for an idempotent one: copying a
// hoster link to the clipboard leaves nothing behind to spend, and a button that
// grays out after one press fails the user the moment they paste somewhere else
// and want it again.
type repeatableHandler struct {
	fn func(ctx context.Context, args map[string]string) error
}

// Execute delegates to the wrapped function.
func (h repeatableHandler) Execute(ctx context.Context, args map[string]string) error {
	return h.fn(ctx, args)
}

// Repeatable is always true: RepeatableFunc only ever adapts idempotent operations.
func (repeatableHandler) Repeatable() bool { return true }

// RepeatableFunc adapts a plain function to a repeatable IntentHandler. Reach
// for it only when a second press genuinely costs nothing; SingleFireFunc stays
// the default, because an operation that acts on the world should be spent once.
func RepeatableFunc(fn func(ctx context.Context, args map[string]string) error) IntentHandler {
	return repeatableHandler{fn: fn}
}
