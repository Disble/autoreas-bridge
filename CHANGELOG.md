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
