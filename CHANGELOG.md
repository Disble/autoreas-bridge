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
