# Changelog

All notable changes to Autoreas Bridge are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version itself is declared in exactly one place — `info.productVersion` in
`wails.json`. An entry here without a matching bump there is a bug in the release,
not a changelog style choice. See `.claude/skills/bridge-release/SKILL.md`.

Wire contracts (REST/WS) have mobile consumers, so any wire-affecting change is
called out explicitly under its release.

## [Unreleased]

## [2.7.0] — 2026-10-26

### Added

- Season → Selection now has a filter bar above the candidate list: choose any combination of grades, verdicts (approved or rejected) and considerations, then sort the visible rows by grade or title. The filters combine — picking more values widens a group instead of replacing it — and each group starts on "All", which means no restriction.
- The filter bar keeps the criteria in force visible, says how many candidates they leave out of the total, and clears them with one action. Filtering is a view only: the approved/slots meter, the confirmed date and Confirm selection still act on every candidate, and hiding a row never rejects it.

### Changed

- A candidate's grade now sits beside its name, to the left of the consideration control, so it reads with the candidate instead of after the page and folder buttons.
- An ungraded candidate reads "None" in the table and in the Grade filter, replacing the bare dash that was easy to mistake for a separator.

## [2.6.0] — 2026-10-26

**Wire-visible change (non-breaking):** `PATCH /api/animes/{id}`, `POST /api/sync/reconcile`, every other authenticated endpoint and the `/ws` handshake now answer `503` with `Retry-After: 1` when a token lookup could not run — the bridge's single database connection was busy — instead of `401`. Of the token-lookup failures only a token that matches no paired device is a `401`; a missing or malformed token is still a `401`. A phone must treat the `503` as retryable and must not unpair or discard pending operations. See `docs/openapi.yaml`.

### Added

- The Editor now tells you what happened when you save, deactivate, restore or repeat an anime: a green toast when it was applied, a neutral one when nothing changed, a warning when someone else changed it first, and a red one when it failed. A failed save is also recorded in Activity's Editor section and opens an incident.

### Changed

- Each anime save is now one database transaction: the change, its progress, its name key and the changes-feed row the phone syncs are written together, or nothing is. The Activity entry and the notice to the phone are written immediately after the commit; before, they came from a subscription, so a save that finished could still lose them, and a save that stalled halfway could block every later change to that anime.
- An anime that is a created candidate of the open season, whose first day is **Ver hoy** and whose progress reaches an episode, now moves to **Visto** as part of that same save, so a `+1` is one change with one time stamp, one Activity row and one notice to the phone.
- The name uniqueness rule that stops two animes sharing a name is now computed by the app itself instead of by SQLite. A database that two different tools folded differently could accept a duplicate name before; the first start on 2.6.0 rebuilds every name key in one transaction and refuses, without changing anything, a catalogue where two animes already share a name — the app then starts without its catalogue until the duplicate is resolved.

### Removed

- The internal tables and startup recovery left over from the previous two-phase save are gone. A database created before 2.6.0 is cleaned up automatically on the first start; later starts do nothing.

### Deprecated

- The upgrade-only migrations are deprecated from now and will be removed in 3.0.0. They exist only so a database created before 2.6.0 opens on 2.6.0: they drop the tables of the retired two-phase anime write and convert the anime name key to a plain column. Before upgrading to 3.0.0, open the app once on the last 2.x release. See `docs/architecture/cross-cutting/deprecations.md`.

### Internal

- The Anime area now has its own architecture documentation: an overview of what it owns, and the save as one decision tree from the command to every outcome, next to a persistence document with the single-connection rule, the two transaction helpers and the startup migration order. `docs/architecture/README.md` indexes them, in English like the code.
- A guard fails the build once `wails.json` declares a 3.x version while upgrade-only migrations are still in the tree, so 3.0.0 cannot ship without removing them. The deprecation register lists the exact removal steps and the older migrations deliberately left in place.
- The real WebView2 fixture now solves through the same solver process and kill-on-close job the app uses, instead of waiting in the test process for a browser to exit on its own, and it fails if any browser process outlives the job.

## [2.5.1] — 2026-10-25

### Fixed

- The app no longer freezes after you edit an episode in the Editor and then save. The Episodes table locked up the whole window when it reloaded after one of its rows had been clicked, for example after saving a new total or saving episode durations.

### Internal

- HeroUI moves to 3.2.6, and React, Tailwind, Vite and other frontend libraries move to their latest patch or minor release. No wire change.

## [2.5.0] — 2026-10-25

### Added

- While the app loads, a splash shows Airis running with popcorn instead of an empty window.
- Activity has a new **System** section. It shows every bridge start, warning or error that no other section owns. Events that repeat within the same hour make one row with a `×N` badge, for example "frontend error: … ×22". System starts off, like Traffic.
- A failed row in Activity has a "Copy for AI" button that copies the row and its details, ready to paste into an assistant.
- The range picker in Activity also picks the start and end times, not only the days.
- Clearing a Cloudflare check is recorded in Activity: when a check appears, when it is cleared, when it fails and why, and which jkanime mirror answered.
- The Run history in Downloads shows which anime and episodes each run touched, not only its totals. A run's detail groups its anime under Failed, Not attempted, Downloaded, Skipped and Up to date:
  - Failed shows the episode and the reason, for example "Episode 7 · Captcha".
  - Not attempted lists the manual download links when JDownloader was offline, with buttons to copy one link or all of them, or to open one.
  - Downloaded names the site host that served each episode, for example "Episodes 9–10 · jkanime.bz".
  - Skipped has an "Edit anime" button.
  - Runs older than 90 days show the totals only.
- The Schedule card in the Editor has a Season row under the weekdays. It shows whether the anime is in Sin ver, Ver hoy or Visto, for example "Sin ver: 4 of 4". The row shows even while Season mode is off, so an anime in the history still shows the section it was in.
- The cover field in the Editor and in Create shows a small preview of the image before the anime is saved.

### Changed

- The Folder and cover fields in the Editor and in Create pick a path with an icon button instead of a "Browse…" text button. The folder icon is the same one Season Intake uses.
- Downloads notice sooner that an episode started or arrived. For the first minute after an episode is sent to JDownloader, the folder is checked every 5 seconds instead of every 20, and an episode that is already in the folder counts at once.
- Stopping a download run no longer abandons an episode JDownloader is already downloading. The run waits for that episode to arrive and be renamed, then stops. If that download hangs, the run can take up to 30 minutes to stop.
- **Activity is now one screen.** The old Now, Incidents, History and Recorder tabs are gone. In their place:
  - a chart of the last 24 hours, 7, 30 or 90 days;
  - a feed of what happened, grouped by day;
  - a detail drawer for each row, with its events and requests.
- The Activity filters work as layers, each one inside the one before:
  1. **Time:** pick a range by clicking or dragging over the chart, or in the range field. Clicking the selected bar again clears it.
  2. **Origin:** All, Phone or Bridge.
  3. **Sections:** Changes, Traffic, Downloads, Tasks, Edits and System. Each one shows how many rows it would add and how many of them failed.
  4. **Failures:** the red button shows only the failures of what is left, and pressing it again shows everything.
- The Activity chart shows what the feed shows. Turning a section off removes its rows from the bars, and with the failure button on every bar counts only failures. The red part of a bar is the share of its rows that failed. Hours with no activity are drawn as hatched gaps.
- Each Activity row states one fact, for example "episode 0 → 1", "3 downloaded" or "1 failed". A download run is one row, not one row per episode.
- Every tooltip in Activity uses the app's tooltip, including the Phone and Bridge buttons, the row icons, the section failure counts, the chart bars and the phone status line.
- The Run history list shows each run's status as an icon with a tooltip. The Stop run button and the problems filter now sit in the card header, and the problems filter is the same red button as Activity's failure button.
- Runs recorded before this version name each anime from the catalog. While the name loads, only the name shows a placeholder. When a run kept no per-anime record for a group, the group says "Episodes not recorded" instead of staying empty.

### Fixed

- Downloads never move or delete your own files. A subfolder you keep inside an anime's folder, for example one with extras, stays untouched. Before, it could be moved into the anime folder and deleted.
- An episode that finishes downloading after you press Stop is now renamed like any other. Before, it kept the name the hoster gave it.
- Automatic downloads and the Season mode search work again while jkanime.net shows a Cloudflare check. The app now clears the check by itself in a hidden window, which can make the first request after a check appears 6 to 11 seconds slower. The jkanime mirrors are still used when the check cannot be cleared. Nothing needs to be installed or allowed.
- The splash now reaches the window before the app finishes loading. Before, the window could stay empty until the app was ready.
- In the Activity detail drawer, the arrow keys move focus along with the open row.
- In the Run history, manual download links open in the default browser. Before, they opened in a separate window of the app.

### Internal

- Architecture documentation moved to its own folder, `docs/architecture/`, with one folder per area and Mermaid diagrams. Downloads is the first area: an overview, the whole run as one decision tree, and the hoster attempt phases.
- Every request to an anime provider goes through one shared HTTP client that clears Cloudflare checks (ADR-030). The architecture check enforces it.
- MCP clients of `autoreas-request-mcp` get two additions: the `where` argument also accepts `providers`, and a new read-only tool `count_events` counts events by type, optionally grouped by one metadata key.
- ADR-031 records how Activity gives every event a section, with System as the fallback.
- A new `airis-sprite-animation` skill documents how to make Airis animations.
- Download run events record more per anime, and MCP clients of `autoreas-request-mcp` see it:
  - every event about one anime stores its name (`animeName`);
  - page and link failures store the episode;
  - two new info events, `download.anime_checked` and `download.manual_link_offered`, are added;
  - `get_run_story` steps carry the anime id (`EntityID`).
- A new desktop binding, `PreviewAnimeCover`, renders a cover that is not saved yet through the same thumbnail service as a saved cover.

No REST or WebSocket change: mobile clients see no new endpoint, field or message. See `docs/openapi.yaml`.

## [2.4.0] — 2026-10-23

### Added

- The bridge now records screen freezes reported by the mobile app. When the phone's screen takes 2 seconds or more to respond after a touch, after returning to the app, or after a window focus or resize, the phone sends a report. It appears in Activity history as the cause and duration (for example "app_active 120000 ms"), and a freeze of 10 seconds or more opens an incident.
- **Wire-visible, additive**: `POST /api/sync/diagnostics` accepts a new `screen_stall` kind. Bridges before 2.4.0 answer it with `400 kind_not_served`, so the mobile app must not send it to them. Every other request is unchanged. See `docs/openapi.yaml`.

## [2.3.1] — 2026-10-22

### Fixed

- Automatic downloads work again. jkanime.net started blocking the app behind a Cloudflare check, so every download check failed with "HTTP 403" for every anime. The app now uses jkanime's own mirrors, jkanime.org and jkanime.bz, whenever jkanime.net shows that check, and goes back to jkanime.net automatically once it is lifted.
- Searching an anime by name in Season mode works again for the same reason, and the anime page links it saves still point at jkanime.net.

### Internal

- The architecture check before each commit no longer scans git worktrees kept inside the repository folder, and git ignores that folder.

No wire change.

## [2.3.0] — 2026-10-22

### Changed

- Every button that shows only an icon now has a tooltip naming what it does. It appears after a short pause, also when you reach the button with the keyboard, and still shows on a disabled button with the reason it is disabled (for example "Remove · An anime must stay on at least one day").
- Tooltips of the page and folder buttons name the action first and show the path or URL on a second line, instead of showing only the path.
- Buttons now follow one order of importance across the app: the main action of a screen is the solid blue button, other actions are gray, and disclosures such as "Show episodes" are quieter still. Before, some lesser actions looked more prominent than the actions above them.
- In the Editor, "Open schedule editor" is now a main action with its text, and "Deactivate anime" is an icon button that turns red on hover; its confirmation dialog is unchanged.
- In Create, each anime card keeps its actions in its header: Undo autofill (after fetching metadata), Fetch metadata and Remove. Remove is now an icon button instead of red text.
- On Today, the "−" episode button is gray instead of blue text, and the "+", "−" and status buttons have tooltips; right-click still adds or subtracts half an episode.
- On the ordering boards, Duplicate reads "Duplicate to another day" on both boards. The discarded intake rows use the same Restore icon as the rest of the app, and "Copy for AI" in Activity uses the copy icon.

### Internal

- A lint rule now rejects an icon-only button that does not go through the shared icon button, and the design documentation describes the standard and the button order.

## [2.2.0] — 2026-10-21

**Wire change (non-breaking):** the season premiere grade endpoint now accepts a phone grade over a manual one when it was rated later, and its `409` body's `source` can now be `mobile_sync` as well as `manual`. See `docs/openapi.yaml`.

### Added

- The Catalog is redesigned: a cover grid or a list view, a Filters popover for status, type and genres, removable chips for the active criteria, and your search, filters and sort are kept while you move around the app.
- The Catalog sorts by Last watched and Date created, newest first, and Status and Type accept several values at once.
- The Details screen is redesigned around one card: a toolbar with Back, Repeat, Restore and Edit, a full-size cover, the type and status chips beside the name, one progress line, the general data next to the cover with a button to copy the folder path, and Watch history in its own card. The Page link opens in your default browser.
- A season premiere grade changed on the phone or on the desktop now appears in Activity's Recent changes, and the History Season filter shows it too, worded the same way in both places.

### Changed

- A season premiere grade can be changed from either side, and the most recent change wins. Before, a grade set on the desktop could never be replaced from the phone.
- Every screen now shares the same header row with its actions on the right and no subtitle; Today's Season/Daily toggle moves into that row, and Notifications shows its unread count beside the title.
- Page tabs take only the width of their labels and never wrap, and the History search field fills the free width of its filter bar.
- The Catalog scrolls with the page and fills the app's width like every other screen.
- The Editor's Create tab opens straight onto its form, and the sidebar shows only the app name.

### Removed

- The Catalog's Active, Day and Download gap filters.

### Fixed

- Opening the app no longer fails when the database is briefly locked at startup: it waits a moment and continues.

### Internal

- Three checks that failed only on a busy machine were fixed at their cause, so the commit gate no longer fails at random under load.
- Covers for the Catalog and Season share one cache that asks for each cover once.

## [2.1.1] — 2026-10-20

### Fixed

- Looking up MyAnimeList metadata no longer stops when the episode count or the episode duration is missing, marked unknown or in a shape the app cannot read: that single value is skipped quietly, the rest of the metadata still fills in, and a field you already filled keeps its value.
- The "MyAnimeList did not provide" note is no longer shown, so a partial lookup leaves no warning behind and needs nothing dismissed.

### Internal

- The frontend test and coverage run asks for fewer parallel workers and advances asynchronous checks on explicit timers, so the same suites finish on a busy machine without changing timeouts, isolation or coverage rules.

## [2.1.0] — 2026-10-19

### Added

- The Activity screen now opens on what is happening right now, gathers every failure into one Incidents tab, and keeps a two-hour History you can scrub, replacing the previous single-table view.
- Activity answers the whole day and the last 90 days at a glance, and the History calendar stays visible above the card instead of disappearing with the list.

### Changed

- Covers are rendered from the best artwork source available, at up to 480 px tall and at a higher JPEG quality, so they stay sharp without storing oversized images. The cover endpoint keeps its contract; the phone simply revalidates and receives the new bytes.
- Incidents are now trimmed by age instead of by a fixed row count, so recent failures stay available while old ones stop consuming space.

### Fixed

- The bridge no longer crashes on shutdown when the database never finished opening.
- Activity shows recorded metadata exactly as it was stored, and clears the detail pane when you change the filter.
- The editor redraws only the list and form panels whose content actually changed, so typing stays responsive in large libraries.

### Internal

- Debug capture retains incidents built from failed requests, error events and mobile failures, with an hourly rollup and the distinct response versions of each route.
- The MCP read tools expose the activity layers, broadcasts, hourly totals per day and response versions; the previous capture tools were removed.
- Commit and merge lanes run one after another, so the Go and frontend suites no longer compete for CPU.
- A one-off maintenance script corrected stored cover URLs that pointed at resized MyAnimeList variants. It is not part of the application and does not run on its own.

## [2.0.0] — 2026-10-18

This release changes how season data reaches the phone and must be installed together with the matching Autoreas mobile release. An older mobile build no longer receives season candidates from this bridge.

### Changed

- The phone now learns season candidates, their premiere grades and whether a season is open through the normal anime sync, so it stays up to date even when the app was in the background instead of only while it was open and connected.
- **Wire-visible, breaking**: anime served by `GET /api/animes`, `GET /api/animes/{id}` and every snapshot of the changes feed carry an optional `season` — `seasonId` and `grade` (1–6, or `null` until graded) — present only while the anime is a candidate of the open season. It is computed when served, never stored, and a change that only touched the candidacy arrives as an `update` with `changed_fields: [season]` that never moves `modified_at`.
- **Wire-visible, additive**: the reconcile response always carries `season_mode`, true while a season is open.

### Fixed

- A grade given on the phone for a season that has since closed is no longer recorded in the season that replaced it. **Wire-visible, additive**: `POST /api/seasons/active/ratings` accepts an optional `season_id` and answers `404` when it is not the open season.

### Removed

- **Wire-visible, breaking**: `GET /api/seasons/active` (now `404`), the `season_changed` and `preferences_changed` WebSocket messages, and the inbound WebSocket `season_rating` message are gone. Season state reaches the phone only through the anime sync, and grades only through `POST /api/seasons/active/ratings`.

## [1.17.2] — 2026-10-17

### Fixed

- Cover images in **Fetch metadata** and in the season provider search no longer show up broken. MyAnimeList's small preview images were failing to load, so the results now use the full-size cover, and any cover that still fails to load shows the anime placeholder instead of a broken-image icon.
- Anime created from a MyAnimeList match now keep a sharper cover, because the full-size image is saved instead of MyAnimeList's 116×180 preview. Covers you already have are unchanged.

## [1.17.1] — 2026-10-17

### Fixed

- The tray icon no longer stops responding after the app has been running for a while. Before, the icon could stay visible but ignore every click, so **Abrir** and **Salir** did nothing and the only way out was to end the process, even though the app itself kept working.

## [1.17.0] — 2026-10-16

### Added

- Bridge now remembers how long each episode runs. Every episode a download lands is measured once and stored, and when the app starts it fills in, in the background, the episodes of active anime that do not have a duration yet. A stored duration belongs to the episode, not to the file: moving or renaming the folder keeps it. Measuring needs `ffprobe` on the PATH; without it nothing is measured and nothing fails.
- **Today** marks a row whose next episode runs long (over 30 minutes) with a chip such as **Ep. 7 · 45 min**, and a download that lands a long episode raises a **Capítulo largo** notification. The mark comes from the stored durations, so opening Today measures no file; an episode copied into a folder by hand gets its mark at the next start, after a download of that anime, or with **Re-analyze folder**.
- The Editor has an **Episodes** card to correct those durations: re-analyze the folder and review what changed before confirming it (a value you set by hand is kept), edit an episode's minutes, add an episode, or clear a duration. It opens and closes with **Show episodes** / **Hide episodes** without losing what you edited, and a "(?)" next to **Folder** explains that changing the folder does not recalculate durations.
- The Editor has a **Schedule** card that shows at a glance the days the anime airs and its place on each one ("3 of 3"), and holds the **Open schedule editor** button.
- Backups now include the episode durations: an export carries them and an import restores them exactly.
- Closing a season now records its ordering board and Daily board. A past season's **Ordering** and Daily board show what was recorded, read-only, and its **Overview** shows an outcome funnel, the grade histogram, the selection outcome and the final lineup. Seasons closed earlier show that the board was not recorded.
- Each intake row can look up its anime on MyAnimeList (**Fetch metadata**, then **Use this match**). The confirmed type, episodes, duration, origin, genres, studios and cover are kept on the row and applied when the anime is created; the anime name always stays the one you entered.
- Intake rows that are **Pending**, **Not found**, **Ambiguous** or **Search failed** have a **Find on provider** button: it searches every download provider while you type and lists each page with its cover, as "Provider · page URL", ranked by how close its title is. **Use this page** resolves the row to that page.
- Discarded intake rows are kept in their own view: an **Active / Discarded** toggle appears next to the **Intake list** title when there are discarded rows, each one has a **Restore** button, and discarding a row shows a toast with **Undo**.
- The intake list updates live while **Run matching** runs, row by row, with a progress line that names the phase ("Matching names… N of M", then "Checking episode availability… N checked").
- The daily availability check of an open season, which used to run at a fixed 21:00, now runs at a time you choose from the **Daily check 21:00** button in the **Intake list** header. **Save** applies it right away, without restarting Bridge.
- **Sin ver** has a **Send & download now** button beside **Send to Ver hoy** that sends the checked animes and starts the season download right away, and **Ver hoy** has a **Download now** button whenever it lists animes, for example to fetch an episode released after today's run.
- Saving a different **Library root** first opens **Change library root?**, listing the active animes that will be updated and those left unchanged, then points the affected animes' folders at the new root. Files on disk are not moved, and inactive history is never touched.
- **Wire-visible, additive**: anime served by `GET /api/animes`, `GET /api/animes/{id}` and every snapshot of the changes feed carry an optional `episodes` list — `episode`, `minutes` and `long` — so Mobile can show the same long-episode mark as Today. It is omitted when an anime has no stored duration, and a change that only touched durations arrives as an ordinary `update` with `changed_fields: [episodes]` that never moves `modified_at`.
- **Wire-visible, additive**: the same anime payloads carry `folderRelative`, the anime's folder below the library root with `/` separators. It is computed when served, never stored, and omitted when the folder is not inside the root; incremental changes of an inactive anime still pointing at an old root do not resend it.

### Changed

- The Editor is now three independent cards — the anime data, Episodes and Schedule — and each one saves only its own data (the Episodes card with **Save episodes**), and the Episodes card always works from the saved anime, never from unsaved edits. The unsaved-changes prompt still covers all of them: **Discard changes** drops every draft, and **Save and continue** saves each card that has changes and only moves on if every save succeeded (it waits while a re-analysis runs).
- The first-watch date is now set automatically the first time an anime's watched progress goes from zero to more than zero. It can no longer be edited in the Editor, the anime detail shows it as **First watched** instead of **Premiere**, and older anime without a date are not backfilled.
- **Wire-visible, behaviour**: `PATCH` on an anime still accepts `fechaEstreno` but ignores it, and `premieredAt` now means the first observed zero-to-positive progress instant; creating an anime that already has progress leaves it null. The payload shape is unchanged.
- The Season workspace is redesigned. **Intake & Daily** rows show covers and round icon buttons (metadata, page, folder and a ⋯ menu), the match chip appears only when a row needs attention, and **Sin ver**, **Ver hoy** and **Visto** use the same card format, with a grade chip on Visto. **Evaluation** lists ungraded anime first with **Rate** and **Skip**, **Selection** groups candidates under "Approved · N" and "Rejected · N", and **Ordering** shows the weekdays in one row that wraps to the available width.
- The open-season **Overview** has a season card with its creation date, minimum approval grade, slots and **Close season**, and a selection outcome chart (Approved / Rejected / No grade) replaces the approved-vs-slots meter. A closed season shows a **Closed** chip and "Read-only — editing is disabled."
- Empty states are redesigned: they adapt to the space they sit in, a screen shows Airis at most once, an empty Season tab says which step fills it and links there, and a search or filter with no results shows a search icon with the clear action. Inspectors and detail panes (**History**, **Notifications**, **Run history**, **Transaction**, **Event**) show a "No … selected" pane with their fields dimmed until you pick a row.
- Options: the **Downloads** tab is now **Library**, and **Downloads root** is now **Library root**, the one folder on this computer where your anime library lives. The existing value carries over automatically.
- Each intake row now starts with its create checkbox, named after the anime; long names are truncated with the full name on hover instead of pushing the actions onto a new line; and resolving a row, from a candidate or from **Find on provider**, rechecks its availability right away.
- **Sin ver** no longer shows the "N selected for today" count; the checkboxes already show what is selected.
- The **Activity** transaction list re-renders less while scrolling and while live updates arrive.
- **Wire-visible, behaviour**: the changes feed is stricter for Mobile. For one anime, a later change never carries an older snapshot than an earlier one, its `timestamp` always rises — even within the same millisecond, if the clock goes back, or after acknowledged changes are pruned — a `create` or `update` always names the fields it changed, and no change is recorded for an anime that no longer exists. The payload shape is unchanged.

### Fixed

- An edit made on the desktop could be undone on a phone: when two changes to the same anime were recorded close together, the phone could receive a later change carrying an older copy of the anime. Every change now carries the anime as stored at that moment.
- After every paired device acknowledged its changes, a new edit could get the same timestamp as one a phone had already applied, so the phone could skip it. The last change of each anime is now kept as the floor for the next one.
- **Wire-visible, behaviour**: a newly created anime now reaches the changes feed (`GET /api/animes/changes`, reconcile `bridge_changes`) as `change_type: create` instead of `update`, and is broadcast over WebSocket as `anime_created` instead of `anime_changed`. Changes recorded earlier are still served as `update`.
- Sync diagnostics from current Mobile builds are accepted again: reports carrying the `native_module_unavailable` or `remote_change_rejected` events were refused with a 400.
- One failed name search no longer stops **Run matching**: that row is marked **Search failed**, the rest keep matching, and the next run tries it again. Names containing `/` (such as *Ranma 1/2*) are found on jkanime again.
- Viewing a closed season no longer makes **Today** and the **Season** badge act as if a season were open.
- Season tabs no longer flash their empty state while the season is loading or next to a load error, **Selection** no longer shows a 1970 date for a selection that was never confirmed, the **Overview** metadata card is sized to its content again, and the **Raw** intake box has a visible border in both themes.
- If the notification service cannot be reached, **Notifications** shows an alert instead of an empty list.
- The **Open page** button on **Sin ver** rows now opens the anime's page in your browser; before, it did nothing.
- The desktop app no longer receives a fake change notice for a nonexistent anime at startup.

### Internal

- Episode durations live in their own table, `anime_episode_durations`, and reach Mobile through their own `episode.durations_changed` event, so the anime write path, its outbox and `modified_at` are untouched. Deciding which file is which episode is one shared Go component (`internal/anime/identity`), ported from the prototype and checked against its decisions on real folders; it refuses to guess rather than assign a doubtful file.
- Only committed writes announce `anime.changed`: the legacy queued update path is removed, and the outbox drain is the only publisher.
- The library root setting moves from `downloads.root` to `library.root` with an automatic migration; the season check time is stored as `season.availability_check_time` (falling back to 21:00) and is not carried by backups. Season backups carry the new closure and intake-metadata columns.
- The provider search, the season check time and the matching progress events are Wails-only, so they add no REST or WS contract.
- Shared presentation parts under `shared/ui` (the lookup modal pieces and `OpenPageButton`) replace per-feature copies; the design system now lives in `docs/design/`, with new Airis artwork and the chip and icon-button rules.
- The render smoke test covers every rail route and fails on uncaught errors; the local gate is simpler and mutation audits run in CI; new worktrees generate their Wails bindings on their own.

## [1.16.0] — 2026-09-27

### Added

- The Editor Library now shows each anime's saved cover next to its name, with the shared placeholder while it loads or when the anime has no cover; the selected anime's header shows the same cover beside its title, and both thumbnails follow a saved cover change or fall back to the placeholder when the cover is removed or fails to load.
- **Wire-visible, additive**: anime list items now carry a `hasCover` boolean reporting whether the anime has a stored cover, so clients can skip cover fetches for coverless entries; nothing already deployed changes, since the field only adds information to the existing payload.

## [1.15.0] — 2026-09-25

### Changed

- **Wire-visible, additive**: `POST /api/sync/diagnostics` now accepts more than one kind of report. A body with no `kind` key still means a sync-cycle report, byte-identical to before, so nothing already deployed changes; a body declaring `kind: "episode_action"` is accepted and stored, and every kind keeps its own retention budget so a frequently reported kind can no longer push a rarely reported one out of the retained history.
- **Wire-visible, additive**: every refusal on that endpoint also carries a `code` field naming why the request was refused. `kind_not_served` is the only recoverable code — it means this bridge does not serve that kind yet, and a later build will — so a client that reads it should keep such a report rather than discard it. Every other code is permanent.
- The device diagnostics view no longer shows reports stored by an earlier version. They are not deleted and nothing is migrated: they stay unread in the retired table, which the bridge no longer creates on a fresh install. Reintroducing them would be a one-off script, deliberately not part of the app.

### Fixed

- Device diagnostics are readable again. The desktop view had been reading a store the bridge stopped writing to, so it showed only older reports and never a current one.

### Internal

- Sync-cycle diagnostics moved to one store discriminated by `kind`, with a per-kind retention budget and a refusal vocabulary that grows by adding a member rather than a new status code. The reasoning, the alternatives refused and the lifecycle boundary that forbids reshaping an existing row are recorded in `docs/adr/026-diagnostics-kind-store.md`.

## [1.14.0] — 2026-09-21

### Added

- Device sync diagnostics are finally readable. The bridge stores every sync-cycle report a paired device sends, but until now the only way to look at one was raw JSON. A new read path over the stored reports, with the desktop bindings to match, surfaces each report's trigger, outcome and counters as values, and a diagnostics capture in the Activity rail renders the report legibly — saying so when a capture carries no report instead of showing blanks as zeroes.
- Every stored diagnostics report now also appears as a runtime event, so a stream of failing syncs is visible in Runtime Events without opening the reports. A retried report is not a second event: only a report the bridge actually stored emits one.
- The Activity Overview tab now states the limits each diagnostics surface obeys — how many rows each store keeps, how many each page returns — taken from the code that enforces them rather than written by hand, and shows how many of the bridge's diagnostic read capabilities Activity exposes, naming any it deliberately leaves to the agent-facing side.

### Changed

- The Activity rails stay fast however far you scroll. The Transactions and Runtime Events tables used to keep mounted every row you had ever paged past; they now render only the rows on screen plus a small margin, so scrolling deep into thousands of captures, or typing with hundreds loaded, no longer drags the whole window down.
- The Activity text filters search now. Route, outcome, kind and the events search box used to match a value exactly — the Route field's own placeholder named a value the database never contains — and they match case-insensitive substrings now, with `%`, `_` and `\` searched literally instead of acting as wildcards. The HTTP status filter stays exact: searching `4` does not start matching `404`.
- Activity searches got bounded. Each filter query reads one page from SQLite instead of every matching capture — response bodies and headers included — so a first page that took 150–370 ms now answers in about a millisecond, and the captured-request resolver stopped reading every stored body on every page it walks.
- The bridge status strip lives in the Activity Overview tab, where it belongs, instead of sitting above the rails; the Runtime Events tab no longer shows it.

### Fixed

- The Activity rails no longer freeze the window. A focused row combined with a table reload sent the table component into an endless internal scan — the renderer burned a whole core for as long as you left it sitting there, with the loading skeleton frozen on screen. The loading placeholders no longer sit inside that component's row collection, so the scan has nothing to walk.
- Typing in an Activity filter no longer flickers the rail. The query now waits until you stop typing, the rows already on screen stay put while the refreshed page arrives — with a discreet note in the status line — and the skeleton is reserved for a rail that has nothing to show yet.
- Newly captured requests respect the filter you are searching by. A live arrival used to be inserted no matter what the active filters said, so a filtered rail quietly refilled with rows that did not match.

### Internal

- No REST or WebSocket contract changed in this release: the new diagnostics read reaches the desktop UI through Wails bindings, and parity between the desktop and the agent-facing diagnostics tools is now held by structure — a capability catalog in the core, a declared manifest per adapter, one conformance suite run against both, and a build-time fitness function — instead of by discipline.
- Documentation and instruction housekeeping: the ODD feature records for this batch (activity search, filter debouncing, rail virtualization, observability parity), the project instructions mirrored into one byte-identical canonical pair, active SDD guidance deprecated, the lean-tests skill gained guidance for equivalent mutants, the policy test now asserts the documented size rule instead of one exact sentence, `.gitignore` ignores the gentle-ai profile, and the ditto mutation-scope limitation was reported to the ditto team.

## [1.13.1] — 2026-09-16

### Fixed

- Backup export/import now includes your watch history. Restoring a backup on another machine used to leave the History screen empty even though everything else came back — the bundle now carries every watch-history row and restores it exactly.

## [1.13.0] — 2026-09-15

### Added

- Your anime covers now reach the phone. The mobile app shows each anime's cover art: the bridge serves it as a small thumbnail, the phone keeps it, and the list still looks right when the bridge is out of reach.
- A cover whose image file you move, rename or delete keeps working. The bridge holds on to the last copy it loaded and serves that one, instead of reporting the anime as having no cover — which used to make the phone drop the copy it already had. Putting a different image at the same path still switches everyone to the new art.
- Fill in an anime's details straight from MyAnimeList. Both the Create form and the Editor now have
  a "Fetch metadata" action beside the name: type a name, pick the right match from the search
  results, and confirm to fill in type, episode count, duration, source, genres and studio — you
  always pick, nothing is applied automatically. A misspelled or approximate name still finds the
  right anime; MyAnimeList's own search tolerates typos far better than the alternatives tried.
  Fields the lookup cannot answer — like your download page, folder, or watched episodes on Create,
  and your watching status and premiere date on the Editor — are never touched, and a field
  MyAnimeList genuinely does not report is called out rather than silently left blank. One button
  press undoes the fill if you change your mind.
- History is now a real watch history. Every episode you watch gets its own row with the time you watched it, listed newest first under a heading for each day that shows how many episodes you watched that day — the way a browser lists the pages you visited. Select any row to open that anime.
- Rolling an episode back removes its row, so the history always agrees with your progress. Rewatching an anime from the start keeps the history of the earlier watch instead of wiping it.
- Anime Detail shows that anime's own watch history: its 50 most recent episodes, with a pointer to History when there are more.
- A jump of several episodes from the mobile app records each episode in between, so nothing you skipped past goes missing. The episode the sync lands on is dated by the phone's own watch time; the episodes in between keep the sync time, because nothing ever reported when those were watched.
- The first launch of this version builds your history once from the progress the bridge already recorded, which goes back to 2026-07-05, and takes a restore point of the database right before it does. History cannot reach further back than that date, and the empty History screen says so.
- El Historial ahora se filtra por nombre, estado, tipo y rango de fechas: los filtros viven en la URL (se pueden compartir y sobreviven a recargar), la búsqueda lleva debounce y seleccionar una fila abre un inspector con la portada, el estado, el tipo, el progreso y los 3 episodios más recientes.

### Changed

- The History screen loads as you scroll instead of all at once, and shows a loading placeholder, an empty state or an error message rather than a blank table.
- History follows its new layout: the filters sit in one labelled row, the Watched filter shows its range as dates ("Sep 1 – Sep 13, 2026") and clears from its calendar, each day reads like "SATURDAY, SEPTEMBER 12" with its episode count, and the side panel says when you last watched ("Yesterday, 17:16") and shows an illustration while no episode is selected.
- Anime Detail puts Edit anime, Repeat and Restore beside the anime's status. Its Watch history opens the current watch, and any watch from before the log began, as soon as the page loads; each watch shows its dates as a range ("Aug 29 – Sep 11, 2026") with its progress inside, and All episodes tags every row with the watch it belongs to.
- Opening or copying an anime's page or folder is no longer written to the activity log. It goes to the diagnostic event log, which rotates on its own.
- The activity log keeps its most recent 5,000 entries — about two and a half years at the current rate — instead of growing forever.
- El historial de Anime Detail es ahora una única sección Watch history con pestañas Por visualización (un acordeón por cada vez que se vio, con resumen de fechas para las anteriores al registro) y Todos los episodios; la antigua línea de tiempo de repeticiones desaparece.

### Fixed

    - Episodes you mark on the phone now show the time you watched them, not the time your phone reconnected. Watching three episodes offline and syncing hours later used to put all three at the moment of the sync; each episode now keeps its own watch time. A phone whose clock is wrong cannot push a time into the future either: such a time is ignored and the sync time is used instead.

### Internal

- Wire change: one new REST route, `GET /api/animes/{id}/cover`, documented in `docs/openapi.yaml`. It answers a JPEG thumbnail of at most 320 px tall with a strong ETag, 304 when the phone already holds those bytes, 204 when the anime has no usable cover, and 503 with `Retry-After` while thumbnail generation is saturated. No existing endpoint changed shape, so a phone that does not know about this route is unaffected.
- A thumbnail is generated once and cached on disk under the image's identity — its path, size and modification time for a local file, the hash of the downloaded bytes for a URL — together with the thumbnail spec version, so a replaced image or a spec change can never serve stale bytes. The last-good copy of a local file is kept beside that cache and only ever used when the original is missing. Recorded in `docs/adr/024-cover-thumbnail-cache.md`.
- Captured requests no longer store image bodies, so serving covers does not grow the diagnostics database by a copy of every image. The desktop renders its own covers through the same pipeline that serves the phone, rather than a separate path.
- No REST or WebSocket contract changed: the new history reaches the desktop UI through two new Wails bindings, and the old snapshot-based history binding is gone.
- The history lives in its own permanent table, one row per episode per rewatch, separate from the capped audit log and the rotating diagnostic log. Recording is derived from the before/after progress of each change rather than from what kind of action caused it, so the desktop and mobile write paths cannot disagree. Recorded in `docs/adr/023-watch-history-model.md`.
- Mutation testing now runs after each commit in a separate worktree with a per-test timeout. A mutant that deadlocks the single SQLite connection used to hang a run for go test's default ten minutes.
    - The phone's own watch time is stored beside the moment the bridge received the change, on the audit row, instead of replacing it. The audit still records what arrived and when, and the correlation id built from it does not move, while a replay of the history now reproduces the rows a live write produced rather than re-creating the old behaviour. Correcting the rows that were already stored was done once, deliberately, outside the application: the application's startup path gains no data-mutating step, and no migration, marker or command for it ships.

## [1.12.0] — 2026-09-11

### Added

- Keyboard shortcuts. `Alt+1` through `Alt+0` jump straight to the ten sections in the order the rail shows them — Today, Downloads, Editor, Catalog, History, Season, Devices, Activity, Notifications, Settings — and `Alt+R` marks the loaded notifications as read while the Notification Center is open.
- Press `?` for the list of shortcuts. It is built from the shortcuts themselves rather than written by hand, so it cannot drift out of date, and it shows the ones belonging to the screen you are on alongside the global ones.
- Shortcuts stay out of your way while you type. Nothing fires from inside a text field, and any control that already uses a key keeps it: arrow keys still move through a table, and Escape still closes an open dropdown instead of triggering a shortcut behind it.
- Every shortcut is yours to change, under Settings → Shortcuts. The full list of shortcuts is the first thing on that screen — so you can find out what exists without having to know to press `?` first — and each row rebinds by pressing the combination you want. `Alt+` is only the default now, not a decision made for you.
- Getting out of a broken keymap never needs the keyboard. Any single shortcut reverts from its own row, and one button below the list puts them all back to the defaults, both reachable with the mouse alone. A combination already taken by another shortcut is refused while you are still pressing it, rather than silently stealing it.
- Your shortcuts travel with your backups. Exporting writes them into the bundle and importing restores them, and they take effect the moment the import finishes — no restart, no reload. A backup taken before this release simply leaves your current shortcuts alone rather than clearing them.

### Internal

- Shortcuts are declared as data in one registry that the dispatcher, the conflict check and the help list all read, so adding one is a single entry rather than a key handler wired into a component. Two shortcuts claiming the same key is a test failure, not a silent loss. Recorded in `docs/adr/019-keyboard-command-registry.md`.
- Known limitation, deliberately not fixed: a keyboard layout with no Latin letters gets the digit and `?` shortcuts but no letter ones. The one-line change that would address it is written down in the ADR and was left unshipped because no affected user is known.
- A rebound shortcut is stored as one opaque document that the Go side never parses, so the chord vocabulary lives in exactly one place on the frontend and the backend cannot disagree with it. A round-trip test persists deliberate garbage to keep it that way. Recorded in `docs/adr/020-keymap-override-seam.md`.
- Shortcuts became the fourth backup group, and the first one whose contents are a single setting rather than a table — which is what made the import seam's granularity worth proving rather than assuming. Every import group now declares exactly which rows it may modify, and a test seeds two different states to catch an importer that reaches outside its own: without that two-state step a deliberately broken importer passes the check vacuously. Recorded in `docs/adr/021-portable-keymap-and-importer-footprints.md`.
- The pre-commit gate ran TypeScript's type check inside its group of cheap checks, where it starved the frontend test suite it ran beside — tests that take 454ms alone were taking almost six seconds and failing their budget. Type-checking now runs in the frontend lane instead. The gate takes the same wall-clock time as before and the type check itself got three times faster, having been starved too.

## [1.11.1] — 2026-09-08

### Internal

- The `autoreas-request-mcp` diagnostics sidecar no longer fails with a schema validation error when a search matches nothing. `search_requests` encoded an empty result as `items: null` instead of `items: []`, and because the tool validates its own response against a schema that requires an array, a legitimate "no results" came back as a hard error — indistinguishable from the tool being broken. Any filter combination that matched zero captured requests hit it, which is why it surfaced while investigating device-scoped diagnostics traffic.
- The desktop application was never affected by the above: its own Wails binding already normalized the empty page before it reached the UI, so the defect only ever reached the MCP sidecar, which returns the reader's page shape directly. No user-facing behavior changes in this release.

## [1.11.0] — 2026-09-08

### Added

- **Wire change.** Paired mobile devices can now send their sync diagnostics to a dedicated endpoint, `POST /api/sync/diagnostics`, instead of folding them into the body of a sync request. Each report is one sync cycle's post-mortem, and the bridge acknowledges it only once the record is actually stored — which is what lets a device delete its local copy safely. Documented in `docs/openapi.yaml`.
- Diagnostic reports are stored with their cycle id, trigger and outcome as real, searchable columns rather than as an opaque blob, so questions like "how did the last background syncs end on this device?" can be answered directly instead of by reading raw request bodies.
- Every field on an incoming report is checked against a fixed list of permitted values, and anything outside it is rejected with the offending field named rather than quietly rewritten. Reports carry no free-form text at all, so nothing arbitrary from a device is ever persisted.

### Changed

- Under database contention the diagnostics endpoint answers immediately with "try again shortly" instead of waiting for its turn. Diagnostics are the least important traffic the bridge handles, so they now yield to real sync work rather than competing with it, and a device that gets that answer keeps its report and sends it on the next cycle.
- Sending the same report twice is now harmless: the bridge accepts the repeat without storing a second copy, so a device that never received the first acknowledgement can safely retry.

### Deprecated

- **Wire change.** The `client_telemetry` field on the sync reconcile request is deprecated in favour of the new endpoint. It is still accepted and still ignored, exactly as before, and is now declared and documented instead of being an undocumented field that no part of the bridge referenced. Mobile clients send it on both paths during the transition; nothing breaks when they stop.

### Internal

- Recorded two defects found while verifying this release rather than fixing them here: the OpenAPI documentation gate reads only one of the thirteen registered routes and has therefore been passing without checking anything since the router moved to a table, and neither the bridge nor the mobile client bounds a request that stalls on the shared database connection, which is the leading candidate for the background syncs that run their full timeout in silence.

## [1.10.0] — 2026-09-08

### Added

- **Every screen that comes back empty now tells you what to do next.** Today, the Editor library and the Catalogue each answered "nothing here" with a bare line of text, and none of them could tell an empty collection apart from filters that hide everything — or from a request that had not finished yet. Each screen now shows artwork and the single action that fits what actually happened: "Create an anime" when you genuinely have none, "Clear search and filters" when they are only hidden. Today used to show its empty message before it had even asked what you had, inviting you to create anime you already owned.
- **Loading now shows the shape of what is arriving instead of the word "Loading".** Every screen in the app draws placeholder rows the size of the rows about to replace them, so the page no longer jumps when the data lands, and tables keep their header and column widths in place while their rows fill in. Screen readers are now told what is loading the moment it starts, on screens that previously announced nothing at all.

### Changed

- **Windows notifications now say how many anime a run is about, in their first line.** Windows folds a notification's whole detail list into a single block of text and cuts it wherever it stops fitting, so a run that started three downloads could show only two and give you no way to tell. "Download run completed" was already safe because it opened with "3 episode(s) downloaded"; the others were not. A started run now reads "Download check started (scheduled) — 3 anime queued", and a run with failures says "2 of 5 animes failed to download" instead of "some animes failed". The count is in the part Windows cannot cut.
- **A Windows notification no longer hands the system more text than it can show.** A scheduled run naming fifty anime built a single 2,500-character message and left Windows to cut it wherever it liked. The list is now bounded before it is sent, so what arrives is predictable; nothing is lost, because the totals are in the first line and the full record is one click away in the notification centre.
- **Long anime names are shortened inside Windows notifications so each one keeps to a single line.** A name like "Nijuuseiki Denki Mokuroku: Eureka·Evrika" wrapped onto two lines and took the space two other anime would have used, which is why a run over three anime could look like a run over two. Names are now shortened with a "…" — never the line saying what happened to the anime, and never below the point where you can still tell which show it is. The full name is intact everywhere else, including the notification centre.

### Fixed

- **The empty-screen artwork no longer takes over the panel it is meant to decorate.** It is authored at 512 pixels so it stays sharp on a high-DPI display, and nothing capped the size it was drawn at, so on Today the illustration filled the panel and pushed its own "Create an anime" button below the fold on an ordinary window. The empty card is now 328 pixels tall instead of 680, with the button on screen.

### Internal

- Every loading branch in the frontend is now either a shape-mirroring placeholder or a shared `LoadingBars`, and each one sits in a `role="status"` region named by an `sr-only` span — `status` takes its accessible name from the author, so a region named only by its contents announces nothing. Seven panels that already drew skeleton bars had exactly that gap, and were seven copies of the same markup; one shared component closed both at once. See `openspec/changes/archive/2026-09-08-loading-skeletons-completion/`.
- Three surfaces had written the placeholder as a block added *above* the content rather than one that replaces it, so a refetching screen stacked skeletons on top of the real cards. The tests could not fail on it: asserting that a skeleton appears and later disappears passes while both blocks render. The missing assertion is the negative — no real content while loading — and it is now on every surface, proved load-bearing by un-gating a content branch and watching it go red. The three-state rule (skeleton, `AirisEmptyState`, error) is now mandatory in `.claude/skills/autoreas-theme/SKILL.md` rather than conventional.
- A placeholder's height is a contract, so a layout fixture measures every placeholder against the real row it stands in for, in headless Edge at two viewports — jsdom has no layout engine and passes a half-height placeholder. The same fixture had previously reported green on the oversized artwork by checking that it was present, non-zero and inside its card, all of which a wall of illustration satisfies; presence and containment are not proportion, and four proportion checks now run per composition.
- `frontend/src/test/setup.ts` registers `afterEach(cleanup)` once. Testing Library only does that under `globals: true`, and 19 of 115 component suites had never registered it. Adding it unmasked zero failures.
- Complexity attributed to this work by the changed-code gate was paid down by extraction rather than suppression: `SchedulePanel` 16 to 5, `RunHistoryPanel` 17 to 7, `SoloAnimeDownloadPanel` 16 to 3, `useNetworkPanel` 23 to 14.
- No wire change: the REST and WS contracts are identical to 1.9.0, so mobile clients need no update.

## [1.9.0] — 2026-09-04

### Added

- **Two anime can no longer share a name.** A name is how you find an anime in both search rails and how its download folder is chosen, so two records with the same name were indistinguishable in the app and collided on disk. Creating one now warns inline under the Name field as you type, and the catalogue refuses the duplicate outright — including when the existing record was only sent to the trash.
- **The navigation rail now shows the app's own mark.** The rail and the mobile header drew a generic bridge glyph while the taskbar, the installer and the tray all showed the "A". They now all show the same mark, traced from the same master image every icon is generated from, so they cannot drift apart.

### Changed

- **Wire change, additive — mobile clients are unaffected until they opt in.** Each entry in `applied_operations` on `POST /api/sync/reconcile` now carries two optional fields: `modified_at`, the bridge's version token for that anime, and `reason`, which explains a rejected operation as either `unsupported_operation` (permanent) or `conflict` (retry after re-basing). Nothing was removed and no existing field changed shape, so a client that ignores them behaves exactly as before. Together they let a mobile client finally participate in conflict detection: until now it had no way to learn the token it needed to send back, so its writes always silently overwrote whatever the desktop had done. Announced in `docs/openapi.yaml`.

### Fixed

- **A sync conflict no longer discards the whole exchange.** When the bridge rejected one operation for editing a stale value, the entire request failed and the client lost its list of applied operations, the pending changes it had not seen yet, and its place in the change log — for every other operation in the same batch. A conflict is now reported against the one operation it belongs to and everything else in the batch still lands.
- **The bridge no longer sends a mobile client backwards through its history.** Once every paired device had acknowledged the change log, the position the bridge reported fell back to zero, and a client that trusted it would restart from the beginning and re-download everything.
- Episode card actions on Today no longer misfire.
- **Opening an anime folder now launches Windows Explorer by its real path.** It was resolved through the user's `PATH`, so anything earlier on that list named `explorer.exe` would have run instead.
- **Windows now draws a sharp app icon at every size.** The icon shipped with a single 32×32 image, so Explorer's large and extra-large views, the taskbar on a scaled display, and the installer's own window were all upscaling that one small bitmap. The icon now carries 16, 24, 32, 48, 64, 128 and 256 pixel versions.

### Security

- **Paired-device tokens are no longer stored in the request log.** The Authorization header was recorded exactly as sent, and a device token never expires and is never rotated, so every captured request held a permanent credential at rest — in a database that gets copied alongside its own backups. The value is now replaced before the record is written. The header name is kept, so the log still shows that a request was authenticated.

### Internal

- The sync reconcile handler stopped treating a write conflict as a server failure. It had been converted into an error that aborted the batch and returned HTTP 500, which made the per-operation conflict outcome the API documentation already described unreachable — and untested. Conflicts are now reported per operation, a later operation for an already-conflicted anime that carries no version token is refused rather than allowed to overwrite silently, and the documentation was corrected to say this is new rather than long-standing. See `openspec/changes/archive/2026-09-04-sdd-66-occ-token-echo/`.
- Merge commits now run their own pre-merge gate. A merge of two independently green branches ran no checks at all, which is the one place a broken tree can appear without either side being wrong.
- The project is licensed under Apache 2.0, and the README was rewritten as a complete project reference.
- A long SonarQube sweep across both languages: duplicated string literals named, oversized signatures given parameter structs, single-method ports renamed after what they do, and the false positives marked at the call site with the reason.
- Every app icon is now generated from one master image, `build/appicon.png`, by `go run ./tools/genicons`, and a pre-commit check refuses a commit whose icons no longer match it. Two orphaned image files were removed: an unreferenced copy of the tray icon that still held the old pre-rebrand artwork, and the Wails template logo that nothing in the frontend imported. See `docs/app-icons.md`.
- The repository root no longer holds 104 Go files. The desktop shell moved to `internal/desktop` and the root keeps only `main.go`, which is all Wails actually requires beside `wails.json`. Nothing changed at runtime: no logic, no renamed symbol, and the bound surface the frontend calls is identical apart from its namespace (`main` to `desktop`). See `docs/adr/018-desktop-shell-package.md`.
- Release builds can no longer ship an unstamped version in silence, and the guard that promises it now works. Go ignores an `-ldflags -X` whose symbol does not exist, so the failure is silent. Two checks shipped before this one and neither could report the truth: `go version -m` greps the binary for the very flag the build just passed, so it could not fail; its replacement grepped `go tool nm` for a symbol a Windows PE keeps and a Linux ELF never carries, so it could not pass. The value is now read from inside the package by a test, which is exact on both platforms.

## [1.8.3] — 2026-09-02

### Fixed

- **The software store now really does show Bridge's icon before you install
  it.** 1.8.2 claimed to fix this and did not: the package carried the store
  metadata but never named an icon in it, and the image itself was installed
  where the desktop menu looks rather than where the store looks. That is why
  the icon was right in the applications menu and wrong in the store the whole
  time. The icon is now declared explicitly and installed in five sizes where
  both of them look, and installing the package refreshes the caches that
  otherwise keep showing the old listing until you log out.

### Internal

- No change to the application itself: the program in this release is the same
  as 1.8.0. Only the Linux package metadata changed.

## [1.8.2] — 2026-09-02

### Fixed

- **The Ubuntu and Debian software store now shows Bridge properly before you
  install it.** Opening the downloaded package used to show a generic gear
  icon and "No details for this release", even though the icon appeared
  normally once installed. The package now carries the metadata the store
  reads beforehand, so it shows the real icon, a description, the publisher
  and a link to the release notes.

### Internal

- No change to the application itself: the program in this release is the same
  as 1.8.0 and 1.8.1. Only the Linux package metadata changed.

## [1.8.1] — 2026-09-02

### Added

- **Bridge now installs on Debian and Ubuntu.** A `.deb` package ships next to
  the archive. Install it with `sudo apt install ./autoreas-bridge-1.8.1-linux-amd64.deb`
  and the system pulls in the WebKitGTK libraries Bridge needs, adds it to the
  applications menu with its icon, and puts `autoreas-bridge` on your PATH. The
  previous archive shipped a bare program that stopped on a machine without
  those libraries with a message naming a file rather than telling you what to
  install. The archive is still published for distributions that do not use apt.

### Removed

- **The standalone Windows program is no longer published**, only the installer.
  Bridge registers itself to start with Windows, lives in the system tray and
  expects a fixed install location, so a loose copy beside the installer was a
  second, unsupported shape of the same application.

### Internal

- Releases are now built and published by GitHub Actions from a pushed tag,
  covering Windows and Linux, with checksums for every downloadable file.
  Development moves to the `dev` branch; `main` carries deployments only.

- No change to the application itself: the program in this release is the same
  as 1.8.0. Only how it is packaged and delivered changed.

## [1.8.0] — 2026-08-30

### Added

- **Activity keeps its history now.** The Runtime Events tab used to read a small
  in-memory buffer that was emptied on every restart and trimmed to the last 200
  entries. It reads Bridge's stored log instead, so what happened yesterday is
  still there today. The domain filter also offers every domain the log actually
  holds — `download`, the third busiest at 10% of all events, could not be
  filtered for at all before.

- **Transactions reaches the whole capture table.** The tab loaded 25 rows and
  stopped there, and the filters only narrowed those 25. Filtering now runs over
  the full table and the list pages through all of it. Two controls changed as a
  consequence: the status pills became an exact status field, and the free-text
  box was removed — it searched under 2% of the data and returned misses that
  looked exactly like real absences. Proper search needs backend support and
  will arrive as its own change.

- **A new Overview tab inside Activity** summarises request health and events,
  grouped the same way Bridge's own debugging tools group them. Captures with no
  HTTP status — every WebSocket row, 40.8% of the table — are shown as
  "No status" rather than folded into a zero.

- **The Today tab strip marks the current day.** Browsing to another weekday no
  longer leaves you guessing which one today is.

### Fixed

- **Saving anything in the Anime Editor no longer wipes the anime's scheduled
  days.** Eight animes lost their schedule between 2026-07-15 and 2026-08-29
  this way, and seven were repaired by rescheduling them without anyone
  realising why they had emptied.

- **An anime cover can be removed again.** Clearing the cover field and saving
  did nothing at all: the removal never reached the backend in a shape it would
  accept, so the old cover simply stayed.

- **Activity no longer freezes a few seconds after you open it.** The
  Transactions and Notifications lists were paging themselves to the end of the
  table with nobody scrolling, loading page after page until the window stopped
  responding. Transactions also redrew every loaded row once a second to update
  elapsed times; only the rows still running do that now.

- **The Activity detail card stays inside the window.** One long value used to
  stretch the card until the whole application grew a horizontal scrollbar. Long
  values now wrap and scroll inside their own panel, and the panels fill the
  height the card already has instead of stopping short of it.

- **Structured values in the Metadata tab read as formatted JSON** instead of
  `[object Object]`.

### Internal

- **Bridge's runtime log now records a domain that means something.** Several
  places wrote free-text prose where the log expected a domain, including one
  that passed a whole sentence as the domain and a device id as the message.
  Entries are findable by what happened and to what, rather than only by
  searching message text, and a shape guard keeps new event types in the
  `domain.verb` form.

- **Two checks were added over the write log.** One reports committed writes that
  emptied a collection field they were never meant to touch — it found the eight
  lost schedules above with no new instrumentation. The other measures how much
  of the real anime write path is actually observed, as a ratio instead of a
  count: the count had read as healthy while all 368 of its events came from a
  test harness and 468 real writes committed silently.

- **Wire note for paired phones: no REST or WebSocket shape changed.** One
  existing field changes behaviour. `AnimeChange.changed_fields`
  (`GET /api/animes/changes`) and the `changedFields` member of the
  `anime_changed` WebSocket notice have always shipped as an empty array because
  no producer ever filled them; Bridge now derives the list inside the
  transaction that commits the write. The field's type and required-ness are
  unchanged, a client that ignored it is unaffected, and rows written before this
  release keep reading as `[]`. Detailed in `docs/openapi.yaml`.

## [1.7.0] — 2026-08-29

### Fixed

- **A hoster that had actually finished its download could be declared dead, its
  finished package deleted, and the episodes credited to a fallback that
  transferred nothing.** When a transfer completed inside the window where Bridge
  was not looking, Bridge concluded the hoster had failed, told JDownloader to
  remove the completed package, and moved on — so a run could report "3 episodes
  downloaded" while the thing that downloaded them had just been erased. Bridge
  now re-reads the disk before it is allowed to call any hoster dead, and only
  declares failure when the files really are not there.

- **Episodes that were already on disk when an attempt started are now renamed,
  not just moved.** That path used to leave JDownloader's own opaque filename in
  place. A file Bridge cannot read an episode number from does not count when it
  works out where a series left off, so with one duplicate video in the folder
  the next run could skip a real episode and never come back for it.

- **"Watch" on a downloaded notification row now opens Today.** It used to open
  that anime's record page — the screen that describes the series, not the one
  where you watch it — leaving a row that said "ready to watch" one navigation
  short of the episodes.

### Added

- **The download log now records why a run ended the way it did.** Every hoster
  attempt and its outcome, the moments Bridge looked for a transfer starting and
  what it saw each time, every JDownloader package removal, and which exact point
  produced each episode's result are now written to Bridge's log. Before this, a
  successful download and a destructive package removal both left nothing behind,
  and explaining a bad run meant going outside Bridge — into JDownloader's own log
  and Windows file timestamps.

### Internal

- The download core is now exercised end to end against a real filesystem. The
  bug fixed above shipped precisely because every layer had tests and the seam
  between them did not: the existing suite disabled the detection phase and faked
  the file counter, so no test ever read a real folder. Five scenarios now drive
  the real adapters, including a replay of the run that exposed the defect.

- No REST or WebSocket contract changed in this release; the new records live in
  Bridge's own log, not on the wire, so a paired phone needs nothing.

- Mutation-testing tooling updated.

## [1.6.0] — 2026-08-28

### Changed

- **Bridge now listens on port 9876 instead of 8080.** Nothing about the API
  changed, but a phone that was already paired has `8080` written down and will
  stop reaching Bridge until you pair it again: open **Settings → Re-pair** on
  the phone and scan the QR. You do not need a new version of the mobile app for
  that — the QR carries the port, so the app you already have learns the new one
  by scanning.

  The reason for moving: 8080 is one of the ports other desktop software checks
  when it goes looking for a local AI model server. Those requests were arriving
  at Bridge, being answered `404`, and filling the Network panel with traffic that
  had nothing to do with Bridge. 9876 was picked against the ranges Windows hands
  out to outgoing connections, the ranges reserved on this machine, and what was
  already listening.

### Added

- **The port is no longer fixed.** Until now the address Bridge listens on was
  decided when the application was compiled, so a port conflict left nothing to
  do but wait for a new build. It can now be set and cleared, a plain port number
  is accepted, and an address that cannot be used is reported rather than
  swallowed. A change applies the next time Bridge starts, so a running session
  is never moved out from under a phone that is mid-sync.

  There is also `AUTOREAS_BRIDGE_ADDR` for the case where the port is taken and
  Bridge therefore cannot show you a settings screen at all — an escape hatch that
  lived only inside the app would be unavailable in exactly the situation it
  exists for.

### Internal

- Bridge now builds on Go 1.27, and on Wails 2.15.0 — which is not optional: the
  older Wails could not read what a Go 1.27 compiler produces, so `wails dev` and
  `wails build` both failed outright until it moved.

- UUIDs come from the standard library instead of a separate package, and a
  number of small modernisations landed across the codebase with no change to
  behaviour.

- Tests got faster and less prone to failing for reasons of their own: the
  jkanime fixtures now serve over an in-memory network instead of real TCP ports,
  and the slow-handler test runs on a simulated clock instead of waiting 600ms in
  real time.

- The GitHub CI workflow was removed. The gate that decides whether a commit is
  allowed runs locally, and the remote copy only repeated it.

## [1.5.0] — 2026-08-26

### Added

- **Notifications now have a home, and they are kept.** Until now a notification
  was a toast: it appeared, it faded, and if you were not at the screen it was
  gone for good. Every notification Bridge raises is now written down *before* it
  is shown, and the new **Notifications** screen holds the whole history. Search
  it, filter it by source, level or unread, and move between Active and Archived.
  Mark as read or archive one at a time, or select several and do it in one go.

- **A notification says what it is actually about.** "Download run completed" used
  to be a sentence with no subject. A run notification now lists the anime it
  touched by name, each with its cover and what happened to it — downloaded,
  failed, left as manual links, skipped, or already up to date — with the rest
  collapsed into a single "+N more" line instead of an endless list.

- **Buttons that do the thing.** A notification now carries the actions its own
  event justifies, at two levels. About the whole event: **See this run**, and on
  a run that finished cleanly, **Watch today**; **Open Season** and **Download
  now** on season notices; **Open Devices** on pairing and sync warnings. About
  one anime in the list: **Run this anime again** on a failure, **Copy hoster
  N** when the links are waiting for you, **Open in editor** on an anime that was
  skipped. Which button belongs on which notification is written down in
  `docs/notification-cta-policy.md` rather than decided case by case.

- **See this run opens that run.** The run identifier used to be printed in the
  detail pane as a value you could read and not use. Downloads now accepts a run
  in its address, so the button opens the run the notification is about — not
  whichever run happens to be newest by the time you press it.

- **A run says which anime it is about when it starts, not only when it ends.** A
  scheduled run at 3am now names what it is going to check.

- **A warning before a scheduled run skips an anime.** When an anime cannot be
  processed — no folder, nothing to resolve — Bridge says so up front and offers
  to open it in the editor, instead of leaving you to infer it from a run that
  quietly did less than you expected.

### Changed

- **Windows notifications carry the same thing the app does.** A Windows toast
  used to be a title and a line. It now names the anime the event is about and
  carries the same buttons, and pressing one brings Bridge forward and takes you
  where the button says.

- **In-app toasts show the rows and the buttons too.** The same content the
  Notifications screen holds, bounded to three rows so a glance stays a glance.
  The buttons sit under the content rather than beside it, and a long anime title
  now wraps onto a second line instead of stretching the toast off the screen.

- **The notification pane stopped showing you its own bookkeeping.** The internal
  kind and correlation identifier are gone from the detail pane. They are still
  recorded; they were never information for you.

### Fixed

- **Archiving from the detail pane now updates the list.** Archiving a
  notification left it sitting in Active until you navigated away and back.

- **The missed-schedule notice no longer arrives twice.**

- **A run's per-anime button now matches what happened to that anime.** Every row
  used to inherit a verb from the run as a whole, so a successfully downloaded
  anime could be offered a retry.

- **A Windows notification no longer says the same anime name twice.**

- **Toasts stopped dropping half of what they were given.** Rows and actions were
  handed to the toast layer and discarded there.

### Internal

- **No wire changes in this release.** The Notification Center is desktop-only —
  it adds no REST or WebSocket surface, and `docs/openapi.yaml` is untouched, so
  mobile consumers are unaffected. Its tables are created additively and a
  database written by an earlier build opens unchanged.
- New pre-commit job `frontend-layout-smoke` measures the real toast's boxes in a
  headless browser, because jsdom has no layout engine and the overflow above
  shipped through a fully green suite.
- The frontend quality gate moved to dharness; the staged mutation guard now
  mutates added lines only and no longer bills a file move as new code.
- Extracted a generic ordering state machine into `shared/ordering`, withdrew the
  filesystem barrel guard in favour of the ESLint one, removed the dead zod
  scaffolding, and raised the HeroUI floor to 3.2.4.
- **Changelog repair:** the 1.4.2 release renamed the `[1.4.1]` heading instead of
  inserting a new one above it, filing everything 1.4.1 shipped under 1.4.2. The
  heading is restored and both releases now list what they actually shipped.

## [1.4.2] — 2026-08-13

### Fixed

- **Adding an anime to the schedule no longer fails with "anime id is required".**
  Placing a new anime pushes the anime already scheduled around it into new
  positions, and when that reshuffle happened to land them back exactly where
  they already were, Bridge still tried to save the untouched ones — and the save
  was rejected, taking the whole creation down with it. Spreading a single anime
  across three days was enough to trigger it. Untouched neighbours are now left
  alone and the anime is created.

### Internal

- No wire changes in this release.

## [1.4.1] — 2026-08-10

### Fixed

- **Episodes past number 16 are found again.** jkanime serves its episode list 16 at
  a time, and Bridge only ever read the first batch — so for any anime past episode
  16 it saw "latest online 16", decided nothing was new, and skipped the download
  without an error. Long-running series silently stopped downloading at 16. Bridge
  now reads the whole list before deciding, and a listing it cannot read completely
  fails loudly instead of quietly reporting an anime as up to date.

### Internal

- No wire changes in this release.
- The Go mutation-testing guard now mutates only the lines a change touched
  instead of whole files, which cut a representative run from ~6 minutes to ~53
  seconds. It remains a manual tool, outside the commit gate.
- Removed the abandoned gremlins configuration and rewrote `docs/mutation-testing.md`
  around the runner actually in use.

## [1.4.0] — 2026-08-07

### Added

- **Downloads → Configuration shows JDownloader's download limit.** A new *Download
  limits* card reports the "Max. simultaneous Downloads" value Bridge reads from
  JDownloader and paces itself to, so the number is visible instead of guessed. It
  is read-only, and a Refresh button re-reads it after you change it in
  JDownloader. If the setting cannot be read, the card says so rather than showing
  a limit of zero.

## [1.3.0] — 2026-08-07

### Fixed

- **The same episode is no longer downloaded twice.** When several anime were
  downloading at once, an episode could be fetched to completion from two
  different hosters — the full file transferred twice — while extra attempts
  against other hosters piled up as errors. Two separate faults combined to cause
  it, and both are fixed.
- **Episodes no longer land in a folder named after the hoster.** JDownloader
  ships a rule that files every download into a subfolder named after its package,
  so episodes ended up in `Bleach Sennen Kessen-hen\bleeeacccchthou…-02\` instead
  of the anime folder. Bridge now tells JDownloader to use the folder it asked
  for. Your own JDownloader rules are untouched and still apply to anything you
  add there by hand.
- **Automatic renaming works again.** Because of that subfolder, Bridge lost track
  of the file it had just downloaded and quietly skipped the rename, leaving the
  hoster's name — `bleeeacccchthou…-02.mp4` instead of
  `Bleach Sennen Kessen-hen - Kashin-tan - 02.mp4`.
- **Downloads waiting their turn are no longer treated as failed.** JDownloader
  runs a limited number of transfers at a time and queues the rest. Bridge waited
  60 seconds for a download to start, saw a queued one had not, and gave up on
  that hoster — on a download that was simply waiting in line.

### Changed

- **Bridge now respects JDownloader's "Max. simultaneous Downloads" setting.** It
  never starts more anime at once than JDownloader will actually run, instead of
  handing it a queue it cannot work through. The setting is read at the start of
  every run, so changing it in JDownloader applies to your next run without
  restarting Bridge. If the setting cannot be read, Bridge behaves as before and
  does not limit itself.
- **Renaming is done by JDownloader itself** rather than by moving the file behind
  its back, so JDownloader's own view of your library stays correct. The resulting
  file name is unchanged. Episodes are renamed once the download finishes, so the
  hoster's name is visible while it is still transferring.

### Internal

- Consumes `github.com/Disble/jdownloader-go` v0.1.0, a fork that adds the
  download-list rename and the packagizer override this release depends on.
- The commit gate now fails when the production frontend bundle renders nothing,
  catching the blank-window class of regression that shipped in 1.2.0.

## [1.2.0] — 2026-08-06

### Added

- **You can stop a download run that is already going.** A running run now shows a
  Stop button in Run history. Stopping is not instant and the button says so: the
  run finishes the episode it is already downloading and then ends, and the button
  stays busy until it really has. Stopped runs are recorded as `canceled` so they
  are not mistaken for failures.
- **Downloaded episodes can be renamed automatically.** Hosters name files things
  like `qk2rlwv6tci3.mp4`, which tells you nothing. Turn on *Rename downloaded
  episodes* under Downloads → Configuration and each episode is renamed as it
  lands, using the anime name and its number — `NegaPosi Angler - 04.mp4`. It is
  off until you turn it on, only newly downloaded episodes are touched, and files
  already on disk are left exactly as they are. Names that a filesystem will not
  accept (`Re:Zero`, `Fate/Zero`) are handled, and an existing file is never
  overwritten.

### Changed

- **The Downloads screen is split into two tabs.** *Downloads* holds what you use
  daily — run a check now, download one anime, the schedule, and run history.
  *Configuration* holds what you set once — hoster priority, episode naming, and
  the JDownloader account. Everything about downloads stays on this one screen.
- **A finished run no longer claims it is downloading.** Episodes it never got to
  are now labelled *Not attempted* instead of *Downloading*, and shown in a muted
  colour rather than in-progress blue.

### Fixed

- **Anime states set from the phone now stick.** Marking an anime *En pausa*, *No
  me gusto*, or back to *Viendo* from mobile was being overwritten and collapsed
  into *Finalizado* whenever the anime was fully watched. Only *Finalizado* ever
  appeared to work. A state you choose explicitly now always wins. This affects
  every mobile client — no wire change, but the outcome of the same request is
  different.
- **Reordering hoster priority now actually changes which hoster is tried first.**
  The new order was being saved to a place the download engine never reads, so
  dragging Mega above Mediafire looked like it worked and changed nothing. Reorder
  the list once more after updating and it will take effect.
- **A download run no longer stops after the first episode.** Episode numbers were
  being read out of meaningless hoster filenames, so a random string could be read
  as episode 90 and convince the app an anime was already complete.
- **A run no longer skips past episodes it never downloaded.** When JDownloader was
  unreachable, the run walked the whole backlog and finished holding manual links
  for every missing episode. Downloading a later one by hand hid every earlier one
  behind it, permanently. Runs now stop at the first episode they cannot download
  and offer manual links for that episode only.
- **Manual download links no longer stretch the window.** Long hoster URLs wrap
  instead of forcing a horizontal scrollbar across the whole app.

### Internal

- Pre-commit gate bounded so a commit stops saturating the machine; vitest tuned to
  its measured knee.
- The freeze investigation and the fallow false-positive investigation are written
  up as postmortems for other teams.

## [1.1.1] — 2026-08-04

### Fixed

- **Downloads no longer reports "Download readiness unavailable".** When a second
  copy of Autoreas Bridge was already running, the new copy could not claim the
  port it uses to talk to the mobile app, and that failure stopped the local
  download features from starting at all. Serving the mobile app and checking
  downloads are now independent: if the port is taken, only mobile sync is
  affected, and Downloads keeps working.
- **Errors from the backend are shown as written.** They were being replaced with
  a generic sentence, so a failure could not be acted on or reported. The panel
  now names the actual cause.

### Internal

- No wire changes in this release.

## [1.1.0] — 2026-08-04

### Added

- **Local download readiness.** Downloads now reports, per anime, whether a
  download check can actually start, with a specific reason when it cannot:
  the source page is missing, invalid, or unsupported, or the destination
  folder could not be resolved.
- **Ready/Blocked split in solo anime download.** The rail is now a disjoint
  partition with live counts on each tab rather than one undifferentiated list.
  Ready leads, because it is the only side you can act on. When a search matches
  nothing on the active tab, the empty state names how many matches wait on the
  other one.
- **Progressive loading for long lists.** The Editor library rail, solo anime
  download, Catalog, and run history now render an initial batch of rows and
  grow as you scroll, instead of mounting the entire collection on open. The
  scroll thumb starts short and grows, which reflects what is actually loaded.

### Changed

- **Solo anime download rows were redesigned.** Ready rows carry no status
  badge — a marker every row shares carries no information. Blocked rows carry a
  one-word tag in a fixed-width column, so row width no longer tracks the length
  of a repeated warning sentence; the full explanation appears once, in the alert
  for the selected anime.
- **Run history reveals older runs by scrolling** rather than through a
  "Load N more runs" button. The rail is now its own bounded scroll area.
- Selecting an anime in solo download now survives switching tabs or typing a
  search, instead of being silently dropped when the row leaves the visible list.

### Fixed

- A download-start failure is no longer reported as a readiness failure. The two
  have separate messages, and only the readiness failure offers a retry.

### Internal

- Progressive list rendering is now a documented project pattern
  (`docs/adr/012-progressive-list-rendering.md`), including the constraint that
  live, event-fed lists must not reuse the shared window hook.
- No wire changes in this release.

## [1.0.5] — 2026-08-03

### Fixed

- Test and development builds no longer register themselves for Windows login
  launch.

## [1.0.4] — 2026-08-03

### Fixed

- The desktop UI now updates the Today view live when an anime changes.
- The public product name is presented consistently as Autoreas Bridge.

### Internal

- Barrel imports were removed and the no-barrel policy made self-enforcing;
  dead routes dropped and the Typography migration finished.

## [1.0.3] — 2026-08-02

### Fixed

- Windows startup works, and the window stays hidden when launched at login.

## [1.0.2] — 2026-08-01

### Fixed

- Hoster priority can be reordered again, using pointer-based drag and drop.
- Orphaned pending capture rows are now closed.

## [1.0.1] — 2026-08-01

### Added

- Backup bundles can be imported, with a preview, a restore point, and a full
  refresh afterwards.

### Fixed

- Duplicate bridge instances are prevented.
- JDownloader completion folders are flattened.
- Empty import result slices serialize as arrays rather than `null`.

## [1.0.0]

Initial release.

<!-- Releases before 1.1.0 were reconstructed from git history when this file was
introduced; they summarise the commits between release bumps rather than notes
written at the time. -->
