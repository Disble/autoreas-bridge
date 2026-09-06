# Deployment

How a build of Autoreas Bridge becomes something a user can install, what the
pipeline checks before it lets that happen, and what the installed app touches
on the target machine.

This document describes the pipeline as it exists in
[`.github/workflows/`](.github/workflows/). The operational runbook — decision
gates for the version bump, changelog wording rules — lives in
[`.claude/skills/bridge-release/SKILL.md`](.claude/skills/bridge-release/SKILL.md).
When the two disagree, the workflows are the truth.

---

## Table of contents

- [At a glance](#at-a-glance)
- [The version is declared once](#the-version-is-declared-once)
- [Branch model](#branch-model)
- [Cutting a release](#cutting-a-release)
- [What the pipeline does](#what-the-pipeline-does)
- [Release-blocking guards](#release-blocking-guards)
- [Published artifacts](#published-artifacts)
- [Building locally](#building-locally)
- [Verifying a published release](#verifying-a-published-release)
- [Corrections and rollback](#corrections-and-rollback)
- [What the installed app touches](#what-the-installed-app-touches)
- [Troubleshooting a failed run](#troubleshooting-a-failed-run)
- [Known issues, not regressions](#known-issues-not-regressions)

---

## At a glance

| | |
| --- | --- |
| **Trigger** | Pushing a `vX.Y.Z` tag |
| **Runs** | `.github/workflows/release.yml` (GitHub Actions) |
| **Targets** | `windows/amd64`, `linux/amd64` |
| **Output** | A **published** (not drafted) GitHub Release with installer, packages and checksums |
| **Release notes** | The matching `## [X.Y.Z]` section of [`CHANGELOG.md`](CHANGELOG.md), copied verbatim |
| **Secrets required** | None. The publish job uses the built-in `GITHUB_TOKEN` with `contents: write`. |
| **Rollback** | Not possible. Corrections ship as a new patch release. |

There is no server, no container registry and no environment to promote
through. "Deployment" here means *publishing installable artifacts*; the
application itself is local-first and installs onto a user's own machine.

---

## The version is declared once

`info.productVersion` in [`wails.json`](wails.json). Nothing else declares a
version — every other place derives it:

| Consumer | How it gets the version |
| --- | --- |
| Windows installer | `wails build -nsis` regenerates `build/windows/installer/wails_tools.nsh` from it |
| Debian package | `build-linux.yml` exports `VERSION`; `nfpm.yaml` expands `${VERSION}` |
| AppStream metadata | `@VERSION@` substituted into `io.github.disble.autoreas-bridge.metainfo.xml.in` |
| Artifact filenames | `autoreas-bridge-<version>-<platform>-<arch>.<ext>` |
| Backup bundles | Linked into the binary as `-X <pkg>.bridgeVersion=<version>` |
| The git tag | Must be exactly `v` + the declared value |

> [!WARNING]
> A missing `info.productVersion` is not an error — Wails silently falls back to
> its hardcoded `1.0.0`. Absence is never a declared version.

`build/windows/installer/wails_tools.nsh` is **generated output**. It is tracked
only because a local build rewrites it; never hand-edit it, and never commit
`build/bin/**` (gitignored).

---

## Branch model

`dev` carries development. `main` carries deployments. Adopted 2026-09-01.

```text
feature work ──▶ dev ──merge──▶ main ──tag vX.Y.Z──▶ Release workflow
```

- Work lands on `dev`. Never commit development directly to `main`.
- A release exists only after `dev` is merged into `main`.
- **The tag goes on the `main` commit.** The `guard` job runs
  `git merge-base --is-ancestor` and fails a tag build whose commit is not an
  ancestor of `main`, before a single build minute is spent.

That guard is the *only* thing enforcing this: no branch is protected, and
`main` is still the default branch.

---

## Cutting a release

All of steps 1–5 happen on `dev`, in one commit.

1. **Decide the bump.** Review what shipped
   (`git log --oneline <last-release-tag>..HEAD`) and apply the gates:

   | Change shipped | Bump |
   | --- | --- |
   | Bug fix, no contract or UX change | patch |
   | New feature, backward compatible | minor |
   | Breaking wire / DB / config change | major |

   REST and WebSocket contracts have a mobile consumer. A breaking wire change
   is a major bump and must also be announced in
   [`docs/openapi.yaml`](docs/openapi.yaml).

2. **Set `info.productVersion`** in `wails.json`.

3. **Update `CHANGELOG.md`.** Promote `## [Unreleased]` to
   `## [X.Y.Z] — YYYY-MM-DD` and leave a fresh empty `## [Unreleased]` above it.
   Entries are written in the user's language under Keep a Changelog headings
   (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, plus
   `Internal`) — never pasted commit subjects.

   > [!IMPORTANT]
   > **Never hard-wrap a changelog entry.** One bullet is one line, however
   > long. GitHub renders a release body's soft line breaks as `<br>`, so an
   > 80-column wrap that is invisible in the file becomes a forced break every
   > 80 characters on the release page. Measured on v1.9.0, which shipped that
   > way and had to be re-edited.

4. **Log the rationale:** `node scripts/log-lesson.mjs "..."` — never by editing
   [`docs/learning-log.md`](docs/learning-log.md) by hand.

5. **Commit** as `chore(release): bump to X.Y.Z`. The pre-commit gate takes
   ~90s–300s; give the command at least a 300000 ms timeout, and never bypass
   the hooks.

6. **Merge `dev` into `main`** and push `main`.

   `git merge` does not run the pre-commit gate — the separate
   `pre-merge-commit` hook does, and its jobs are whole-tree rather than globbed
   to a staged file list.

7. **Tag the merge commit on `main`** and confirm it landed where you think:

   ```bash
   git tag vX.Y.Z
   git tag --points-at HEAD
   ```

8. **Push the tag.** That, and only that, starts a release:

   ```bash
   git push origin refs/tags/vX.Y.Z
   ```

9. **Watch the run:** `gh run list --workflow Release --limit 1`. On success the
   release is published at
   `https://github.com/Disble/autoreas-bridge/releases/tag/vX.Y.Z`.

---

## What the pipeline does

```text
push tag v*
     │
     ▼
  guard ─────────────── the tagged commit must be an ancestor of main
     │
     ├──▶ windows  (build-windows.yml, windows-latest, CGO_ENABLED=1)
     │
     └──▶ linux    (build-linux.yml,   ubuntu-latest,  CGO_ENABLED=1, -tags webkit2_41)
              │
              ▼
          publish ───── tag-only; downloads both artifact sets, extracts the
                        CHANGELOG section, publishes the GitHub Release
```

`workflow_dispatch` runs `guard`, `windows` and `linux` but **publishes
nothing** — the `publish` job is gated on `github.ref_type == 'tag'`. That is
how a build is proven between releases.

Concurrency is grouped per ref with `cancel-in-progress: false`: a release run
is never cancelled halfway by a second push.

### Shared build shape

Both platform jobs, in order: check out, set up Go from `go.mod`, set up Bun
(pinned to `1.3.11`, kept in sync with `frontend/package.json` →
`packageManager`), then install the **Wails CLI resolved from `go.mod`** rather
than pinned a second time — the CLI that generates the bindings and the library
the app links against must be the same version.

There is no separate frontend step: `wails build` runs the frontend itself
through `wails.json` → `frontend:install` / `frontend:build`, which is why Bun
must exist before the build step.

Third-party actions are pinned to a commit SHA rather than a tag, with the
human-readable version in a trailing comment — a tag can be repointed at
different code by whoever controls that repository (SonarQube
`githubactions:S7637`).

### Windows specifics

- `CGO_ENABLED=1` is pinned deliberately. The system tray only compiles under
  `windows && cgo`; with CGO off the bindings file drops out, the no-op package
  vars stay, `Start()` still returns `nil`, and the installer ships a dead tray
  **with no build error and no log line**.
- `makensis` is resolved on the runner and only installed via Chocolatey as a
  fallback.
- Only the installer is staged into `dist/`. Wails still builds the bare
  `build/bin/autoreas-bridge.exe`, but it is not published (see
  [Published artifacts](#published-artifacts)).

### Linux specifics

- Build dependencies: `build-essential`, `pkg-config`, `libgtk-3-dev`,
  `libwebkit2gtk-4.1-dev`.
- `-tags webkit2_41` is required: Wails' `gtk.go` pkg-configs `webkit2gtk-4.0`
  unless that tag is set, and Ubuntu 24.04 ships only 4.1.
- The `.deb` is built with [`nfpm`](build/linux/nfpm.yaml), and the icon is
  resized from `build/appicon.png` into the hicolor theme at 48/64/128/256/512
  — **not** into `/usr/share/pixmaps`, which is a legacy path the desktop shell
  searches but that an AppStream `type="stock"` icon does not resolve against.
- The Linux artifact is the app **minus** the Windows-only integrations, which
  are compiled out by build tags and replaced with labelled no-ops: no desktop
  toasts, no autostart, no system tray, and a non-secure crypto fake. It is not
  a second first-class desktop build.

### Publishing

The release body is the changelog, not the git log. `publish` extracts the
`## [X.Y.Z]` section with `awk`, strips the CRLF carriage returns
(`CHANGELOG.md` is CRLF-encoded), and **fails if the section is empty or
missing** rather than shipping a release with no notes.

It publishes rather than drafting, because a draft is invisible to anyone
testing a build and its assets are not reachable from the tag.
`fail_on_unmatched_files: true` means a missing artifact fails the run instead
of publishing a partial release.

---

## Release-blocking guards

Every one of these exists because its failure mode is **silent** — a green build
that ships something broken. Do not remove one to make a run pass.

| Guard | Job | Catches |
| --- | --- | --- |
| Tagged commit is an ancestor of `main` | `guard` | A release cut from unmerged `dev` |
| Tag equals `v` + `wails.json` `productVersion` | both builds | A tag that disagrees with the declared version |
| `./internal/tray` compiles `systray_bindings_windows_cgo.go` | windows | CGO off ⇒ the installer ships a tray that silently does nothing |
| `INFO_PRODUCTVERSION` readback from the regenerated `wails_tools.nsh` | windows | An installer built from a stale version define |
| `TestBridgeVersionIsStampable` with a probe `-X` value | both builds | An unstamped build whose exported backups are labelled `dev` |
| AppStream renders with no leftover `@VERSION@` / `@DATE@` | linux | A package advertising an unsubstituted placeholder |
| AppStream declares `<icon type="stock">` + `appstreamcli validate` | linux | A store listing that falls back to a generic package icon (shipped in 1.8.2) |
| Icon readback: each rendered PNG really is `<size>x<size>` | linux | A mis-sized icon silently installed into the theme |
| `.deb` declares `libwebkit2gtk-4.1-0` and `libgtk-3-0` | linux | `libwebkit2gtk-4.1.so.0: cannot open shared object file` on the user's machine |
| `.deb` `Version` field and full contents listing | linux | A package missing its `.desktop` entry, metainfo or icons |
| `CHANGELOG.md` has a section for the tag | publish | A release with empty notes |

### Why the version stamp is checked the hard way

`internal/desktop/app_backup.go` declares `var bridgeVersion = "dev"`, and every
exported backup bundle carries it into the user-visible import preview. **Go
ignores a `-X` whose symbol does not exist — exit 0, no warning** — so a stale
import path ships `"dev"` in silence. The workflows therefore derive the path
with `go list -f '{{.ImportPath}}' ./internal/desktop` instead of typing it, and
read the stamp back by running a test **inside** the package with the same `-X`,
because a test in the package can read the unexported variable the linker wrote.

Both obvious shortcuts were tried and discarded: `go version -m` echoes back the
`-ldflags` argument the build just passed, so it matches a binary that stamped
nothing; and `go tool nm` on the shipped binary reports `no symbols`, because
Wails appends `-w -s`. See
[ADR-018](docs/adr/018-desktop-shell-package.md) and
`internal/desktop/app_backup_stamp_test.go`.

---

## Published artifacts

| Platform | Asset | Notes |
| --- | --- | --- |
| Windows x64 | `autoreas-bridge-<version>-windows-amd64-installer.exe` | NSIS installer |
| Windows x64 | `SHA256SUMS-windows-amd64.txt` | |
| Debian / Ubuntu x64 | `autoreas-bridge-<version>-linux-amd64.deb` | Declares its GTK/WebKit runtime dependencies |
| Other Linux x64 | `autoreas-bridge-<version>-linux-amd64.tar.gz` | Bare ELF, for distributions apt cannot serve |
| Linux x64 | `SHA256SUMS-linux-amd64.txt` | |

Workflow artifacts are also uploaded per job (`autoreas-bridge-windows-amd64`,
`autoreas-bridge-linux-amd64`) with a 14-day retention, which is what a
`workflow_dispatch` build produces.

**The portable Windows `.exe` is deliberately not published.** Bridge is an
installed application: it registers auto-start, lives in the system tray, and
expects a fixed install location. A loose copy is a second, unsupported shape of
the same product on the same platform — and it carried blank Windows file
properties besides. The Linux tarball is a different case: it is the only
artifact a non-Debian distribution can use.

---

## Building locally

A local build is a **rehearsal for smoke-testing**. It ships nothing and is
never the answer to "cut a release" on its own.

```bash
# Derive the import path — never type it; a stale -X links silently.
PKG=$(go list -f '{{.ImportPath}}' ./internal/desktop) || exit 1

wails build -platform windows/amd64 -nsis -clean \
  -ldflags "-X ${PKG}.bridgeVersion=X.Y.Z"
```

Then verify, in this order:

```bash
# 1. The stamp resolved (the .str symbol exists only when -X applied).
go build -ldflags "-X ${PKG}.bridgeVersion=X.Y.Z" -o stamp-check.exe .
go tool nm stamp-check.exe | rg -F "${PKG}.bridgeVersion.str"

# 2. The regenerated define matches.
rg 'INFO_PRODUCTVERSION "' build/windows/installer/wails_tools.nsh

# 3. The UI actually paints (~4s, headless Edge).
bun --cwd="frontend" run render:smoke
```

> [!CAUTION]
> **Launching the binary and seeing the process stay alive is not a smoke
> test.** 1.2.0 shipped a completely blank WebView behind a healthy Go startup
> log — bindings, event bus and HTTP server all reported ready. See
> [`.claude/skills/frontend-render-smoke/SKILL.md`](.claude/skills/frontend-render-smoke/SKILL.md).

After the automated check, smoke-test what no test can reach: window and tray
behaviour, single-instance handling, and the installer flow. If you cannot run
it, report it as unverified — never imply you did.

If a local build regenerated `wails_tools.nsh`, commit it with the version bump
rather than leaving the tree dirty.

---

## Verifying a published release

```bash
# Linux
sha256sum -c SHA256SUMS-linux-amd64.txt
```

```powershell
# Windows
Get-FileHash .\autoreas-bridge-X.Y.Z-windows-amd64-installer.exe -Algorithm SHA256
```

Then confirm the release page shows every expected asset, and that the notes
match the `## [X.Y.Z]` section of `CHANGELOG.md`.

---

## Corrections and rollback

**There is no rollback.** Once a release is published, anyone may already have
downloaded it.

- **Never re-cut, move or force-push a published tag.** The download someone
  already has would stop matching the tag it claims to be.
- A correction is a **patch release**: bump, changelog, merge, new tag.
- To stop distribution of a bad build, delete or mark its GitHub Release —
  that removes the assets from the releases page, but not from anyone's disk.

---

## What the installed app touches

Relevant when supporting a user, and when reasoning about what an upgrade or an
uninstall preserves.

### Windows

| | |
| --- | --- |
| Install directory | `C:\Program Files\autoreas-bridge\Autoreas Bridge` (`$PROGRAMFILES64`, requires elevation) |
| Shortcuts | Start Menu and Desktop |
| Uninstall entry | `…\CurrentVersion\Uninstall\autoreas-bridgeAutoreas Bridge` |
| Runtime prerequisite | WebView2 — the installer bootstraps it if absent (preinstalled on Windows 11) |
| Removed on uninstall | The install directory and the WebView2 data path under `%AppData%` |

### Linux (`.deb`)

| Path | Contents |
| --- | --- |
| `/usr/bin/autoreas-bridge` | The binary (short name — it is what a user types) |
| `/usr/share/applications/io.github.disble.autoreas-bridge.desktop` | Desktop entry |
| `/usr/share/metainfo/io.github.disble.autoreas-bridge.metainfo.xml` | AppStream listing |
| `/usr/share/icons/hicolor/<size>/apps/io.github.disble.autoreas-bridge.png` | 48, 64, 128, 256, 512 |

The desktop entry, the icon and the AppStream component share one reverse-DNS
id. `postinstall.sh` runs on both install and remove to refresh
`gtk-update-icon-cache`, `update-desktop-database` and `appstreamcli` — every
command guarded, because a missing cache updater must never fail the install.

### User data — survives uninstall

| Platform | Path |
| --- | --- |
| Windows | `%APPDATA%\Autoreas\data\bridge.db` |
| Linux | `~/.config/Autoreas/data/bridge.db` |

Resolved through `os.UserConfigDir`, deliberately outside the install directory
so Windows UAC cannot block writes under `C:\Program Files`. **Neither
uninstaller removes it** — the database is the user's, and a reinstall finds it
again.

### Network

The HTTP API binds `0.0.0.0:9876` by default. The persisted setting is the
ordinary route; `AUTOREAS_BRIDGE_ADDR` (a bare port works) is the recovery
route, and the environment wins. An address change applies on the **next start**
rather than rebinding underneath paired devices mid-session. See
[README → Configuration](README.md#configuration).

---

## Troubleshooting a failed run

| Failure | Cause | Fix |
| --- | --- | --- |
| `… is not on main. main is the deployment branch` | Tag placed on a `dev` commit | Merge `dev` into `main`, delete the tag, re-tag the merge commit |
| `tag vX.Y.Z does not match wails.json productVersion` | Bump and tag disagree | Fix `wails.json` on `dev`, merge, re-tag |
| `CHANGELOG.md has no '## [X.Y.Z]' section` | Version bumped without promoting `[Unreleased]` | Add the section, merge, re-tag |
| `internal/tray compiles without systray_bindings_windows_cgo.go` | `CGO_ENABLED` lost on the Windows job | Restore `CGO_ENABLED: "1"` — never delete the check |
| `the -X stamp did not resolve` | The desktop package moved and the derived path no longer matches the declared variable | Confirm `bridgeVersion` still lives in `internal/desktop` |
| `… does not depend on libwebkit2gtk-4.1-0` | `nfpm.yaml` `depends` edited | Restore the dependency; the tarball is the only artifact allowed to ship a bare ELF |
| `the metainfo declares no stock icon` | `metainfo.xml.in` lost its `<icon>` | Restore it — this is the 1.8.2 generic-icon bug |
| Release body renders as a narrow column | Changelog entries were hard-wrapped | Unwrap the bullets, ship a patch release |

A tag that has never published a release may be deleted and re-pushed. A tag
that **did** publish one may not.

---

## Known issues, not regressions

- **The built `.exe` has blank Windows file properties** (ProductName,
  ProductVersion, FileVersion, CompanyName). The **installer's** are correct —
  measured on 1.8.0. `-ldflags` does not fix this: it stamps a Go variable, not
  the Windows VERSIONINFO resource.
- **SmartScreen warns on every download** — *"isn't commonly downloaded"*. That
  is a reputation warning, not a detection. The artifacts are unsigned.
- **The Linux packaging metadata still declares the project proprietary.**
  `build/linux/io.github.disble.autoreas-bridge.metainfo.xml.in` sets
  `project_license` to `LicenseRef-proprietary` and `build/linux/nfpm.yaml`
  omits `license:` outright, both on the stated grounds that the repository
  carries no LICENSE file. It does now — [Apache 2.0](LICENSE) — so the
  published `.deb` and its store listing understate the licence.
