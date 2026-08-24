/** The page title, which matches the nav label by the app-wide "page header equals nav label" convention. */
export const NOTIFICATION_CENTER_HEADER_TITLE = 'Notifications';

/**
 * What the subtitle says about the screen once the unread count is out of the
 * way.
 *
 * It deliberately does NOT claim the list is sorted "unread first", which the
 * page used to say. The store's list query is
 * `ORDER BY created_at_ms DESC, id DESC` and read state is not in that sort at
 * all, so the old copy described an ordering that has never existed. What the
 * sentence promises instead is the thing the inbox does do: outlive the toast.
 */
export const NOTIFICATION_CENTER_HEADER_STANDING_LINE = 'Warnings and failures stay here after the toast disappears.';

/** Joins the unread count to the standing line, matching the artboard's middot. */
export const NOTIFICATION_CENTER_HEADER_SEPARATOR = ' · ';

/** What the subtitle leads with while nothing at all is unread. */
export const NOTIFICATION_CENTER_HEADER_NONE_UNREAD = 'No unread';

/** Label of the header's bulk action. */
export const NOTIFICATION_CENTER_HEADER_MARK_ALL_LABEL = 'Mark all as read';
