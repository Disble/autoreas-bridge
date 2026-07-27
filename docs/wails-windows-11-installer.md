# Wails v2 Windows 11 NSIS installer guide for `autoreas-bridge`

This report explains the verified Wails v2 path to produce, validate, sign, and distribute a Windows 11 installer for this repository. It stays within the current repo shape: Go backend, Bun frontend, Wails v2, and the checked-in NSIS template under `build/windows/installer/project.nsi`. This is documentation only. No build was run for this report, so every item marked **Local validation required** still needs execution on a real Windows 11 machine.

## Executive summary

- This repo is already structured for Wails v2 Windows packaging.
- The checked-in installer template already does the heavy lifting: architecture gate, Program Files install, WebView2 bootstrap attempt, shortcuts, uninstall, and English UI.
- The biggest repo-specific release gap is metadata: `wails.json` defines `name`, `outputfilename`, and Bun scripts, but it does **not** define Wails `Info` product metadata. That directly affects `build/windows/info.json`, version resources, install directory naming, and uninstall display fields.
- The safest verified Wails v2 build syntax is `wails build -platform windows/amd64 -nsis` because the official v2 CLI reference documents `-platform` and `-nsis`.[^wails-cli] The repo's NSIS comments mention `--target windows/amd64 --nsis`; treat that long-form syntax as **Local validation required** because it is not documented in the official v2 CLI page.[^project-nsi][^wails-cli]
- The current installer uses the **online WebView2 bootstrapper** path. That is good for normal Windows 11 distribution, but it is **not sufficient for fully offline installs** when a target machine is missing the runtime.[^wails-windows][^ms-webview2-distribution]
- For application updates, this repo needs a deliberately designed updater protocol and release process. The reviewed Wails v2 CLI, Windows, and NSIS installer docs describe packaging and WebView2 behavior, but they do **not** document a built-in auto-update subsystem for Wails v2 itself.[^wails-cli][^wails-windows][^wails-nsis]

## Quick start

### Prerequisites

| Requirement | Repo or source evidence | Notes |
|---|---|---|
| Go toolchain | `go.mod` declares `go 1.25.0` | Match repo Go version for reproducibility. |
| Wails CLI v2 | `go.mod` pins `github.com/wailsapp/wails/v2 v2.12.0` | Prefer the CLI version that matches the module version. |
| Bun | `frontend/package.json` pins `packageManager: bun@1.3.11` | Frontend build depends on Bun. |
| NSIS with `makensis.exe` on `PATH` | Wails Windows installer guide and NSIS download page | Required for `-nsis` packaging.[^wails-nsis][^nsis-download] |
| Windows 11 build host | User target + current NSIS template | Strongly recommended for release packaging. |

### Verified quick-path commands

```powershell
go version
bun --version
wails version
wails doctor

bun install
wails build -platform windows/amd64 -nsis
```

Expected artifact locations after a successful build:

- App binary: `build/bin/autoreas-bridge.exe` **Local validation required**
- NSIS installer: `build/bin/autoreas-bridge-amd64-installer.exe` from `project.nsi` line 74

### Reproducibility recommendation

Use the repo-pinned tool versions whenever possible:

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

That command is a recommendation for repo reproducibility. The official Wails install page documents `@latest` as the standard install form.[^wails-install]

## Current repo state

| File | Current state | Release impact |
|---|---|---|
| `wails.json` | Defines `name`, `outputfilename`, `frontend:install`, `frontend:build`, `frontend:dev:*`, `author` | Good build wiring. Missing `Info` product metadata. |
| `build/windows/info.json` | Template consumes `{{.Info.ProductVersion}}`, `{{.Info.CompanyName}}`, `{{.Info.ProductName}}`, `{{.Info.Copyright}}`, `{{.Info.Comments}}` | Without `Info`, Windows version resources need local validation before release. |
| `build/windows/installer/project.nsi` | Unicode, HiDPI, English UI, Program Files install, admin execution level, WebView2 runtime macro, shortcuts, uninstall, architecture check | Solid base template. Current WebView2 provisioning is online-bootstrapper based. |
| `frontend/package.json` | Bun-managed frontend, `build` script is `tsc && vite build`, package manager pin is `bun@1.3.11` | Clear frontend production pipeline. |
| `go.mod` | Wails v2.12.0, Go 1.25.0 | Use matching CLI if you want fewer build-drift surprises. |

## End-to-end lifecycle

## 1. Prepare a reproducible build workstation

1. Install Go and confirm `go version`.[^go-install]
2. Install Bun and confirm `bun --version`.[^bun-install]
3. Install Wails CLI and confirm `wails version`.[^wails-install]
4. Install NSIS and confirm `makensis.exe` is on `PATH`.[^wails-nsis][^nsis-download]
5. Run `wails doctor` and resolve any missing Windows prerequisites, especially WebView2 detection.[^wails-install]

Recommended release-host policy for this repo:

- Build on Windows 11 x64.
- Keep Go, Wails CLI, and Bun version-pinned in release notes or CI logs.
- Archive the generated installer, checksum file, and signing logs together.

## 2. Restore frontend dependencies

The repo declares Wails frontend hooks directly in `wails.json`:

- `frontend:install`: `bun install`
- `frontend:build`: `bun run build`

That means a normal `wails build` will use Bun for frontend install/build according to current project configuration.

Practical implication:

- If Bun is missing, Wails packaging will fail before the Windows installer is produced.
- The frontend lock state lives in `frontend/bun.lock`, so release builds should keep that file committed and unchanged during the release cycle.

## 3. Build the app and generate the NSIS installer

Verified Wails v2 command:

```powershell
wails build -platform windows/amd64 -nsis
```

What this does:

1. Runs the configured frontend install/build flow from `wails.json`.[^wails-cli]
2. Compiles the Windows application binary with output name `autoreas-bridge` from `wails.json`.
3. Uses the checked-in Windows build assets under `build/windows/`.[^build-readme]
4. Invokes NSIS packaging because `-nsis` is supplied.[^wails-nsis]
5. Writes the installer under `build/bin`.[^wails-nsis]

**Local validation required:** the repo template comments mention `wails build --target windows/amd64 --nsis`, yet the official Wails v2 CLI reference documents `-platform windows/amd64`.[^project-nsi][^wails-cli]

## 4. Execute installer validation on Windows 11

Minimum validation path for a release candidate:

1. Start from a clean Windows 11 VM or test machine.
2. Run the installer interactively.
3. Confirm UAC prompt appears because the template defaults to admin execution level.
4. Confirm install path is under `C:\Program Files\...`.
5. Launch the app from Start Menu and Desktop shortcut.
6. Confirm the app opens and renders its Wails/WebView2 UI.
7. Confirm the app appears in Installed Apps / uninstall registry.
8. Uninstall it.
9. Confirm shortcuts are removed.
10. Confirm install directory is removed.
11. Confirm reinstall and upgrade-over-existing behavior on a second pass. **Local validation required**

## 5. Deliver artifacts

Recommended release bundle:

- `autoreas-bridge-amd64-installer.exe`
- SHA-256 checksum text file
- Update manifest and detached signature, if the project adopts the recommended update architecture below
- Release notes
- Signature verification note or screenshot from release QA
- Optional provenance attestation if using GitHub Actions[^github-attest]

## Project-specific configuration walkthrough

## `wails.json`

### Current state

```json
{
  "name": "autoreas-bridge",
  "outputfilename": "autoreas-bridge",
  "frontend:install": "bun install",
  "frontend:build": "bun run build",
  "frontend:dev:watcher": "bun run dev",
  "frontend:dev:serverUrl": "auto",
  "author": {
    "name": "disble",
    "email": "contact@disble.com"
  }
}
```

### What this already gives you

- Stable binary base name: `autoreas-bridge`
- Bun-based frontend install/build commands
- Author metadata only

### What is missing

The repo does **not** define Wails `Info` metadata such as:

- `companyName`
- `productName`
- `productVersion`
- `copyright`
- `comments`

Wails' Windows installer guide shows those values as the source for installer and version-resource metadata.[^wails-nsis]

### Recommendation

Add an `Info` block before the first real release. Recommended shape:

```json
"Info": {
  "companyName": "Disble",
  "productName": "Autoreas Bridge",
  "productVersion": "0.1.0",
  "copyright": "Copyright © 2026 Disble",
  "comments": "Autoreas Bridge for Windows 11, built with Wails v2"
}
```

Why this matters:

- `build/windows/info.json` depends on it.
- `project.nsi` depends on Wails-generated `INFO_*` defines for install path and uninstall metadata.
- Windows Explorer file properties and Installed Apps entries are clearer and more stable.

## `build/windows/info.json`

### Current state

This file is already wired correctly as a template:

- `fixed.file_version` -> `{{.Info.ProductVersion}}`
- `info.0000.ProductVersion` -> `{{.Info.ProductVersion}}`
- `CompanyName` -> `{{.Info.CompanyName}}`
- `FileDescription` -> `{{.Info.ProductName}}`
- `ProductName` -> `{{.Info.ProductName}}`
- `Comments` -> `{{.Info.Comments}}`

### Practical meaning

This file is ready to work **once `wails.json` gets a real `Info` block**.

### Recommendation

Keep this file as-is unless you need extra Windows version-resource fields. The main repo action is to populate `wails.json` metadata, not to rewrite this template.

## `build/windows/installer/project.nsi`

### Current state

The checked-in installer template already includes:

- `Unicode true`
- `!include "wails_tools.nsh"`
- `VIProductVersion "${INFO_PRODUCTVERSION}.0"`
- `VIFileVersion "${INFO_PRODUCTVERSION}.0"`
- English Modern UI pages
- `InstallDir "$PROGRAMFILES64\${INFO_COMPANYNAME}\${INFO_PRODUCTNAME}"`
- `RequestExecutionLevel` inherited from Wails helper, defaulting to `admin`
- Architecture gate in `.onInit`
- WebView2 runtime bootstrap macro
- Start Menu and Desktop shortcuts
- Uninstaller generation and uninstall-registry writes

### Release implications

1. **Version format is strict.** The NSIS script appends `.0`, so the source version should remain numeric `major.minor.patch`. Do not put `-beta`, `+build5`, or other semantic-version metadata into `Info.ProductVersion` because `VIProductVersion` and `VIFileVersion` require four numeric components.[^project-nsi][^nsis-ch4]
2. **Install location depends on metadata.** If company/product strings are empty, the install path and uninstall display strings become risky and require local validation.
3. **The installer is machine-scope by default.** `RequestExecutionLevel` defaults to `admin`, and `wails.setShellContext` switches shortcuts and registry writes to the all-users context.
4. **WebView2 provisioning is online-bootstrapper based.** This is good for normal connected installs and weak for air-gapped installs.
5. **Signing hooks are present but commented out.** That is the right place to integrate installer/uninstaller signing when the organization has a final certificate policy.

### Recommendation

Keep the existing script. Make only the following release-focused adjustments when the team is ready:

- Fill `wails.json -> Info`
- Decide signing hook strategy
- Decide whether offline WebView2 support is required
- Decide whether single-arch amd64 is enough or whether arm64 / dual-arch is needed

## Versioning behavior

Recommended policy for this repo:

- Human release version: `0.1.0`, `0.1.1`, `1.0.0`
- Wails `Info.ProductVersion`: same three-part numeric version
- NSIS/PE file version: auto-expanded to four-part numeric version by `project.nsi`, for example `0.1.0.0`
- Pre-release labels: keep them in Git tags or release names, not in `ProductVersion`

## Architecture targets

## Primary target: `windows/amd64`

Verified Wails v2 target from CLI docs:[^wails-cli]

```powershell
wails build -platform windows/amd64 -nsis
```

This should remain the default first release target for this repo.

## Optional target: `windows/arm64`

Verified Wails v2 target from CLI docs:[^wails-cli]

```powershell
wails build -platform windows/arm64 -nsis
```

Use this only after local validation on a real Windows-on-ARM machine.

## Dual-architecture installer

The checked-in `project.nsi` explicitly documents three `makensis` modes:

- amd64 only
- arm64 only
- combined amd64 + arm64 installer

Repo-safe documented flow:

1. Refresh Wails-generated helper files with at least one Wails Windows build.
2. Produce separate architecture binaries.
3. Run `makensis` with the matching `ARG_WAILS_*_BINARY` defines.

Verified `makensis` patterns from `project.nsi`:

```text
makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app.exe
makensis -DARG_WAILS_ARM64_BINARY=..\..\bin\app.exe
makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\app-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\app-arm64.exe
```

Recommended repo-specific naming for dual-build staging:

```powershell
wails build -platform windows/amd64 -nopackage -o autoreas-bridge-amd64
wails build -platform windows/arm64 -nopackage -o autoreas-bridge-arm64
makensis -DARG_WAILS_AMD64_BINARY=..\..\bin\autoreas-bridge-amd64.exe -DARG_WAILS_ARM64_BINARY=..\..\bin\autoreas-bridge-arm64.exe project.nsi
```

`-nopackage` and `-o` are documented Wails v2 flags.[^wails-cli]

### Limitations

- Cross-architecture success is **Local validation required**.
- Dual-arch packaging adds testing burden because install, launch, uninstall, and WebView2 behavior must be confirmed on both architectures.
- The current install path is `$PROGRAMFILES64`, so the package clearly targets 64-bit Windows.

## WebView2 behavior and offline implications

## What Wails says

Wails Windows builds depend on the Microsoft Edge WebView2 Runtime.[^wails-install][^wails-windows]

Wails supports four runtime-missing strategies at app build time:[^wails-windows]

- `download`
- `embed`
- `browser`
- `error`

## What this repo's installer actually does today

The checked-in NSIS helper macro `wails.webview2runtime`:

1. Checks the documented WebView2 Evergreen registry keys.
2. Skips installation if a runtime is already present.
3. Extracts `MicrosoftEdgeWebview2Setup.exe` to the plugin directory.
4. Executes it silently with:

```text
MicrosoftEdgeWebview2Setup.exe /silent /install
```

That command matches Microsoft's documented bootstrapper installation flow.[^ms-webview2-distribution]

## Why this matters on Windows 11

Microsoft documents that Windows 11 includes the Evergreen WebView2 Runtime by default, while still advising apps to handle the edge case where the runtime is missing.[^ms-webview2-distribution]

## Offline implication

Current repo behavior is **not a fully offline runtime strategy**.

Reason:

- The installer uses the **bootstrapper**, which downloads the matching runtime from Microsoft if the machine is missing WebView2.[^ms-webview2-distribution]
- That is fine for connected environments.
- That will fail on air-gapped or heavily firewalled machines if WebView2 is absent.

## If offline support is required

Use the Microsoft Evergreen **Standalone Installer** or a Fixed Version runtime strategy, both of which are documented by Microsoft.[^ms-webview2-distribution]

Verified Microsoft offline installer pattern:

```text
MicrosoftEdgeWebView2RuntimeInstaller{X64/X86/ARM64}.exe /silent /install
```

For this repo, that is a future packaging decision. It is **not** what the current `project.nsi` implements.

## Code signing

## Goals

- Prove the installer and app came from your organization.
- Reduce tamper warnings.
- Improve enterprise acceptance.
- Preserve trust after certificate expiry by timestamping.

## Certificate options

Choose one of these organization-owned approaches:

| Option | Good for | Policy notes |
|---|---|---|
| Standard code-signing certificate in PFX | Simple first release | Secret handling burden is highest. |
| Hardware token or HSM-backed certificate | Better private-key protection | Operational overhead. |
| Cloud signing service | Centralized enterprise release process | Requires org vendor choice and policy. |

**Policy decision required:** which certificate type, who owns the key, where signing is allowed, and whether CI is permitted to sign.

## Verified SignTool facts

Microsoft documents:[^signtool]

- `signtool.exe` ships with the Windows SDK.
- `/fd` is required for the file digest algorithm.
- `/td` is required for RFC 3161 timestamp digest selection when using `/tr`.
- `sign`, `timestamp`, and `verify` are the relevant commands.

## Recommended signing sequence for this repo

1. Sign the application executable before it is packaged into the installer.
2. Build or compile the NSIS installer.
3. Sign the final installer executable.
4. Verify signatures on both outputs.
5. Timestamp all signatures.

If you want the embedded uninstall executable signed too, use the existing NSIS finalize hooks in `project.nsi`:

```nsi
#!uninstfinalize 'signtool --file "%1"'
#!finalize 'signtool --file "%1"'
```

Those lines are currently placeholders and must be replaced with real organization-approved signing commands.

## Example signing commands

These commands use only documented SignTool options and need your real certificate details:

```powershell
signtool sign /f YOUR_CERTIFICATE.pfx /fd SHA256 /tr https://YOUR_RFC3161_TIMESTAMP_SERVER /td SHA256 build\bin\autoreas-bridge.exe
signtool sign /f YOUR_CERTIFICATE.pfx /fd SHA256 /tr https://YOUR_RFC3161_TIMESTAMP_SERVER /td SHA256 build\bin\autoreas-bridge-amd64-installer.exe
signtool verify /pa /all build\bin\autoreas-bridge.exe
signtool verify /pa /all build\bin\autoreas-bridge-amd64-installer.exe
```

## SmartScreen reality

- Signing helps authenticity.
- Timestamping helps long-term validity.
- SmartScreen reputation still accumulates over time.
- First-release warnings are still possible, especially for low-distribution binaries.

Do **not** promise stakeholders that code signing eliminates SmartScreen warnings. Microsoft shows that unknown programs can still trigger reputation warnings.[^ms-smartscreen-demo]

## Credential protection

- Never commit PFX files.
- Never store certificate passwords in plain text inside repo scripts.
- Prefer OS certificate store, secure secrets storage, HSM, or cloud signing.
- Restrict signing permissions to release automation or release managers only.

## Application updates

## Decision

For this repository, **application updates require a separately designed updater protocol and service**. `wails build -nsis` produces an installer. It does not, by itself, define how an installed app discovers releases, verifies trust, coordinates elevation, replaces files under `C:\Program Files`, records rollout state, or recovers from interruption.[^wails-cli][^wails-nsis][^wails-windows]

This conclusion is intentionally conservative:

- The reviewed Wails v2 documentation covers CLI build flags, NSIS packaging, and WebView2 handling.[^wails-cli][^wails-nsis][^wails-windows]
- In those reviewed Wails v2 pages, no official built-in auto-update capability for Wails v2 was documented.
- A future updater may still be built **on top of** Wails, but it must be designed as product infrastructure owned by this project.

### Local repo implications

- Current install scope is machine-wide under `Program Files` via NSIS.[^project-nsi]
- The running app cannot safely overwrite its own installed binaries in place.
- Any update flow that applies a new NSIS installer over the existing machine-wide install must assume **the app exits before replacement starts**.
- Because the install is machine-scope, update apply usually requires UAC elevation unless the organization adopts a different packaging channel.[^uac][^winget-overview][^msix-overview]

## Windows distribution and update approaches

| Approach | How it works | Strengths | Constraints | Recommendation for this repo |
|---|---|---|---|---|
| User-initiated installer download | User learns about a release from the website, GitHub release, or release notes, downloads the signed NSIS installer, closes the app, and runs it manually | Lowest engineering risk, easiest first release story, clear user intent, fits current NSIS packaging exactly | Weakest update adoption, manual discovery, weaker fleet control, users may skip releases | **Best initial baseline** while update infrastructure is still being designed |
| App-assisted download plus launch of signed installer | Installed app checks an update manifest, shows release notes, downloads a signed installer to a temp location, verifies trust, asks for consent, exits, and launches installer | Better UX, predictable rollout controls, can keep current NSIS channel, allows release channels and staged rollout | Requires new backend service, trust model, recovery logic, UAC handling, temp-file hygiene, and explicit restart lifecycle | **Best medium-term path** for this repo if staying on NSIS + Program Files |
| Enterprise channel: winget / MSIX App Installer / managed deployment | Org distributes updates through Windows Package Manager, MSIX/App Installer, Intune, ConfigMgr, or similar management tooling | Best fleet governance, better compliance story, easier auditability, easier silent or scheduled rollout in managed environments | Higher packaging and operational complexity; MSIX/App Installer is a packaging-channel decision, not a small tweak to the current NSIS flow; winget requires maintained manifests or private repo strategy | **Best for managed deployments**. Keep as a parallel enterprise channel, not as the first end-user-only solution[^winget-overview][^winget-pkgs][^msix-overview][^msix-update-settings] |

### Recommendation

1. **Immediate release posture:** ship signed NSIS installers with manual download and a published checksum.
2. **Next safe evolution:** add app-assisted update checks and signed-installer handoff, while keeping final install ownership in NSIS.
3. **Enterprise option:** evaluate winget and/or MSIX separately for managed estates where centralized deployment matters more than preserving the exact current packaging path.

## Recommended initial update architecture for this repo

The safest initial design is a **manual-consent, manifest-driven updater** that keeps trust and install orchestration in the Go backend.

### Proposed lifecycle

1. App starts and reads its current version and release channel.
2. Backend requests an update manifest over HTTPS.
3. Backend verifies manifest authenticity and validates channel/version policy.
4. Backend compares semantic versions and determines whether an update is applicable.
5. Frontend renders update state and asks for user consent.
6. Backend downloads the installer to a controlled temp path.
7. Backend verifies installer SHA-256 and signature policy.
8. Backend launches the installer with the intended arguments.
9. App exits before installer replacement begins.
10. Installer applies the update and the user relaunches, or the installer relaunches if explicitly configured and validated.

### Recommended capabilities

- **Update-check endpoint or static manifest URL** per release channel.
- **Semantic version comparison** using numeric release versions aligned with `Info.ProductVersion` policy.
- **Release channels** such as `stable` and `preview`.
- **Manual or optional consent** for the first implementation. Silent in-app application is a later policy choice.
- **HTTPS only** for manifest and artifact delivery.
- **Signed artifacts and SHA-256 verification** before apply.
- **Release notes** surfaced before consent.
- **Explicit download/apply/restart states** so failures are diagnosable.
- **Rollout controls** such as staged percentage or allowlist targeting.

### Why this shape fits the repo

- It respects the current NSIS installer ownership.
- It respects the machine-wide `Program Files` install and UAC reality.[^project-nsi][^uac]
- It fits the repo architecture where Go services own process and filesystem orchestration, and the frontend only renders state and consent.
- It avoids pretending Wails v2 itself supplies updater behavior that the official v2 docs do not describe.[^wails-cli][^wails-windows][^wails-nsis]

## Update manifest design

### Minimum manifest goals

The manifest should answer six questions safely:

1. What version is available?
2. For which channel?
3. From where should the installer be downloaded?
4. What hash must the installer match?
5. What policy gates apply, such as minimum supported version or kill switch?
6. How is the manifest itself authenticated?

### Example schema

This is a **recommended schema example**, not a claim that the system currently exists:

```json
{
  "schema_version": 1,
  "product": "autoreas-bridge",
  "channel": "stable",
  "version": "0.1.2",
  "published_at": "2026-07-25T23:00:00Z",
  "manifest_signature": {
    "format": "minisign",
    "sig": "<detached-manifest-signature>",
    "key_id": "stable-root-2026"
  },
  "installer": {
    "url": "https://downloads.example.com/autoreas-bridge/0.1.2/autoreas-bridge-amd64-installer.exe",
    "sha256": "<hex-sha256>",
    "size": 123456789,
    "signature": {
      "format": "authenticode",
      "subject": "Disble",
      "thumbprint": "<optional-cert-thumbprint>",
      "required": true
    }
  },
  "release_notes_url": "https://github.com/disble/autoreas-bridge/releases/tag/v0.1.2",
  "rollout": {
    "mode": "percentage",
    "percentage": 25
  },
  "policy": {
    "min_supported_version": "0.1.0",
    "blocked_versions": ["0.1.1"],
    "allow_downgrade": false,
    "kill_switch": false
  }
}
```

### Hash versus signatures

These are **different controls** and the report should keep them separate:

- **Manifest signature** authenticates the release metadata itself: version, channel, policy, URLs, hashes, and rollout controls.
- **Installer SHA-256 hash** proves the downloaded installer matches the manifest entry.
- **Optional installer signature metadata** records the expected payload-signing policy for the installer binary itself, such as Authenticode requirements.

If an attacker can tamper with both the installer and an unsigned manifest, the hash alone is not enough. The manifest itself must be authenticated through a detached manifest-signature envelope or an equivalently authenticated release-metadata mechanism.

### Secure authentication options

Safe options include any of the following, chosen by organizational policy:

- Detached manifest signature with an embedded public verification key in the app.
- Detached manifest signature verified through an enterprise PKI trust anchor.
- Signed release metadata whose provenance is verified through the organization's release system.

The important point is simple: the authenticated envelope covers the manifest content, while the installer hash and any installer-signing policy remain separate checks on the downloaded binary.

This report intentionally does **not** invent a production key. Key format, storage, rotation, and revocation are organizational security decisions.

### Version and channel rules

Recommended initial rules:

- Only accept manifests for the app's configured `product` and `channel`.
- Only accept upgrades where `version > currentVersion`.
- Reject rollback by default.
- Allow rollback only through an explicit emergency policy path owned by release engineering.
- Refuse update apply if `currentVersion < min_supported_version` and the chosen update path cannot bridge safely. In that case, require a manual recovery or special installer.
- Honor `blocked_versions` as an anti-roll-forward control for known-bad releases.
- Treat `kill_switch=true` as a stop signal for download/apply, or as a strong prompt to block operation only if organizational policy explicitly allows that severity.

### Anti-rollback guidance

Anti-rollback matters because an attacker or stale mirror could try to push an older signed installer.

Recommended initial controls:

- Persist the highest successfully applied version per channel.
- Reject manifests advertising an older version unless an emergency override is explicitly enabled.
- Include monotonic release dates only as supporting telemetry, not as the primary trust decision.
- Keep version comparison numeric and deterministic.

## Windows operational constraints for updates

### UAC and elevation

- A machine-wide installer under `Program Files` commonly needs elevation.[^uac][^project-nsi]
- The update UX must expect a consent or credential prompt.
- A background silent update story is materially harder in this install model and should be treated as a later operational decision.

### Current-process replacement

- The installed app must exit before a replacement installer modifies its installation directory.
- The updater must not assume in-place overwrite of the running `.exe` is reliable.
- If helper processes are introduced later, they must be documented as release infrastructure with their own signing and lifecycle policy.

### Rollback and recovery

- Keep the previous installer artifact and release metadata available for operator-driven recovery.
- Favor **fail closed before apply** over half-applied replacement.
- If installation fails after download verification, the safest first response is to leave the existing installed version intact and report the failure.
- If the installer itself supports upgrade-over-existing well, validate that path on clean and already-installed machines before relying on it operationally. **Local validation required**

### Network, offline, proxy, and firewall behavior

- Update checks and downloads must tolerate timeout, DNS failure, captive portal, and TLS interception realities.
- Enterprises may require proxy support or allowlisted download domains. WinGet explicitly exposes proxy-related options, which is a reminder that real Windows estates do operate that way.[^winget-overview]
- The app must remain usable when update checks fail, unless organizational policy deliberately requires a hard block.
- Offline environments need a manual installer path or a separately maintained offline channel.

### Cancellation and recovery

- User cancellation before installer launch should leave the current install untouched.
- Download cancellation should delete partial files or mark them resumable by policy.
- On next startup, the app should clear stale transient state or offer a retry.

### Multi-user machine scope

- Because the install is machine-wide, one update affects every local user of that installation.
- Update prompts may be seen by one user while the operational impact applies to all users on the machine.
- If per-user update autonomy matters, the packaging/install model itself needs reconsideration.

## Proposed backend/frontend boundary for this repo

This project already targets a hexagonal, ports-and-adapters shape, and the update design should follow that pattern.[^architecture-doc]

### Backend ownership

The Go application service or port-owned adapter should own:

- Manifest retrieval
- TLS and signature verification
- Version comparison
- Temporary file handling
- Installer launch
- Process exit orchestration
- Persistence of update state and last-seen results
- Telemetry emission, if approved

### Frontend ownership

The frontend should own only presentation concerns:

- Render current update state
- Render release notes and consent text
- Trigger explicit user actions through approved bindings or infrastructure adapters
- Show progress, failure, and restart guidance

### Boundary rule for this repo

Do **not** place update orchestration in feature JSX. In this repo's architecture, feature `.tsx` files stay presentational. Any future update UI should keep Wails binding calls and effects in the appropriate hook or infrastructure layer, with the Go side owning trust and process control.

## Update-specific CI/CD and release additions

If the project adopts app-assisted updates, the release pipeline should add the following steps:

1. Build and sign installer artifacts.
2. Generate SHA-256 checksums.
3. Produce release notes and channel metadata.
4. Generate the update manifest.
5. Sign the manifest or publish it through an authenticated release mechanism.
6. Upload installer, checksum, manifest, and signature to durable hosting.
7. Publish rollout configuration for the intended channel.
8. Verify downloadable artifacts from a clean environment.
9. Generate provenance attestation if the organization wants it.[^github-attest]

### Release hosting notes

- GitHub Releases can work as the human-facing release-notes and asset-distribution surface.
- If the updater consumes GitHub-hosted assets, treat API rate limits, private-repo auth, and asset URL stability as design inputs.
- A dedicated download host plus GitHub release notes is often operationally simpler for long-lived updater URLs.

### Testing matrix for updates

Before trusting the updater, validate at least these cases:

| Area | Cases |
|---|---|
| Install topology | Clean install, upgrade over installed version, uninstall after upgrade |
| Version policy | Older manifest, same-version manifest, newer manifest, blocked version, minimum supported version breach |
| Trust | Bad hash, unsigned manifest, bad signature, expired certificate on installer, revoked signer policy if applicable |
| Network | Offline, slow network, TLS failure, proxy required, proxy auth failure, firewall block |
| UX | Consent declined, consent accepted, download cancelled, app closed during check, app closed during download |
| OS behavior | UAC prompt accepted, UAC prompt denied, installer relaunch behavior, desktop shortcut still valid after update |
| Multi-user | Second user session present on same machine, locked files, shared machine install impact |
| Recovery | Partial download cleanup, failed installer leaves old version usable, repeated retry after failure |

### Metrics and privacy cautions

Recommended metrics, only if approved by policy:

- Update check success/failure counts
- Offered version and accepted version
- Download success/failure counts
- Installer launch and completion outcome
- Time-to-adopt per channel

Privacy cautions:

- Do not collect more machine identity than is operationally necessary.
- Avoid transmitting personal data in release telemetry.
- Document retention, opt-out behavior, and administrator visibility before shipping telemetry.
- Treat IP addresses, device names, and installed-version history as potentially sensitive operational data.

### Phased rollout plan

Recommended rollout sequence:

1. **Phase 0:** Manual download only, signed installer, published checksum.
2. **Phase 1:** App-assisted **check only** with release notes and manual website download.
3. **Phase 2:** App-assisted download plus signed-installer handoff with explicit user consent.
4. **Phase 3:** Staged rollout by channel/percentage.
5. **Phase 4:** Enterprise channel support such as winget and/or MSIX App Installer where customer environment justifies it.

## Update troubleshooting

| Symptom | Likely cause | Diagnosis | Repair |
|---|---|---|---|
| App never reports update availability | Manifest URL wrong, channel mismatch, version comparison bug, cached stale manifest | Inspect configured channel, current version, HTTP response, and parsed manifest payload | Fix endpoint/channel mapping, invalidate cache, verify semantic version logic |
| App reports an update that is already installed | Same-version comparison bug or stale local version source | Compare current app version, manifest version, and stored last-applied version | Fix version source and reject `<= currentVersion` |
| Stable users see preview releases | Channel isolation bug | Inspect manifest `channel` and local channel config | Enforce exact channel match |
| Update check fails only on some corporate machines | Proxy, TLS interception, firewall, or allowlist issue | Compare behavior on open network vs managed network; inspect proxy requirements | Document proxy requirements, allowlist domains, add enterprise deployment option[^winget-overview] |
| Download completes but verification fails | Hash mismatch, corrupted mirror, tampered file, wrong artifact published | Compare computed SHA-256 to manifest value and inspect release asset origin | Re-publish correct artifact, rotate mirror, reject file and keep current install |
| Hash matches but trust is still insufficient | Manifest not authenticated | Inspect whether the manifest itself is signed or otherwise authenticated | Add detached signature or equivalent authenticated metadata |
| Signature verification fails | Wrong public key, expired or incorrect signing chain, tampered manifest or installer | Inspect signer identity, trust anchor, and signature payload | Re-sign artifacts or update trusted key material through approved release process |
| UAC prompt appears and users cancel | Machine-wide install requires elevation | Reproduce on standard-user machine and observe prompt path | Keep manual consent UX clear, document admin requirement, offer enterprise-managed channel where appropriate[^uac] |
| Installer launches but update does not apply | App still running, files locked, wrong command-line args, installer failure | Check running processes, installer log, and install directory timestamps | Ensure app exits first, fix installer invocation, validate upgrade-over-existing path |
| App exits and user is left without clear next step | Poor restart/apply UX | Review release-state transitions and user prompts | Add explicit “downloading”, “ready to apply”, and “restart after installer” states |
| Partial download consumes disk repeatedly | Temp-file cleanup missing | Inspect temp directory across retries | Delete failed partials or implement resumable-download policy |
| Update loop repeats every startup | Failed apply is not persisted, current version source never changes, manifest remains eligible | Inspect stored updater state and post-install version detection | Persist terminal failure state and refresh local version after apply |
| Old version is re-offered after a bad release rollback | Anti-rollback rules missing or emergency downgrade path misconfigured | Review stored highest-applied version and manifest policy | Persist highest applied version and require explicit downgrade override |
| Installed app is broken after update on one machine class | Architecture mismatch or environment-specific dependency issue | Compare x64 vs arm64 artifacts, WebView2 presence, and machine policy | Publish the correct architecture, validate on target hardware, and keep fallback manual installer path |
| Update works online but fails in air-gapped environments | Current channel depends on network delivery | Reproduce with no internet and no internal mirror | Maintain offline installer distribution or enterprise-managed package channel |
| Multi-user machine sees inconsistent behavior | One user starts update while another user still runs the app | Inspect concurrent sessions and file locks | Require app-close checks, communicate machine-wide impact, consider maintenance window |
| Support cannot tell where the flow failed | Missing state model and logs | Review whether the app records check/download/verify/launch/apply phases | Add structured update state and support-oriented logs with no sensitive secrets |

## Troubleshooting

| Symptom | Likely cause | Diagnosis | Repair |
|---|---|---|---|
| `wails` command not found | Wails CLI missing or `GOPATH/bin` missing from `PATH` | Run `go version` and `wails version` | Install Wails CLI and ensure Go user bin directory is on `PATH`.[^wails-install] |
| `go` command not found | Go missing or terminal not restarted | Run `go version` | Install Go and reopen terminal.[^go-install] |
| `bun` command not found | Bun missing or not on `PATH` | Run `bun --version` | Install Bun and reopen terminal.[^bun-install] |
| `makensis` not found | NSIS missing or `Bin` folder not on `PATH` | Run a shell lookup for `makensis.exe` | Install NSIS and add its `Bin` directory to `PATH`.[^wails-nsis][^nsis-download] |
| `wails build -nsis` fails before packaging | Frontend install/build failure | Inspect Bun output and `frontend/package.json` scripts | Fix Node/Bun dependency issues, then rerun. |
| Installer builds but app fails to start on a clean machine | Missing WebView2 runtime or failed bootstrapper download | Test on a clean Win11 VM and inspect WebView2 presence | Keep current online bootstrapper for connected users or ship offline runtime for air-gapped installs.[^ms-webview2-distribution] |
| WebView2 install silently fails in offline environment | Current NSIS flow uses online bootstrapper | Reproduce with no internet | Switch to Evergreen Standalone Installer or Fixed Version runtime strategy.[^ms-webview2-distribution] |
| Installer says architecture unsupported | Wrong package for machine architecture | Observe NSIS `.onInit` message and target device architecture | Build amd64 for x64 systems, arm64 for Windows on ARM, or ship dual-arch installer. |
| Windows blocks or warns on first run | Unsigned file or low SmartScreen reputation | Check file properties and signature verification | Sign and timestamp binaries, keep distribution consistent, expect reputation ramp-up.[^signtool][^ms-smartscreen-demo] |
| Broken Start Menu or Desktop shortcuts | Product executable name mismatch or installation failure | Inspect installed folder and shortcut target | Confirm `outputfilename`, `PRODUCT_EXECUTABLE`, and copied binary names align. **Local validation required** |
| Uninstall entry missing or uninstall broken | Metadata/path issues or install did not complete | Check Installed Apps and uninstall registry entry | Populate `Info` metadata and validate install/uninstall on a clean machine. |
| Version resource looks blank or wrong | Missing `Info` metadata in `wails.json` | Inspect file properties -> Details | Add `Info` block and keep numeric `ProductVersion`. |
| Build fails with version-format or `VIProductVersion` issue | Non-numeric version value | Review `Info.ProductVersion` and NSIS version lines | Use only numeric `major.minor.patch`; let NSIS append `.0`. |
| `windows/arm64` build or package fails | Cross-arch toolchain or environment mismatch | Retry on a proper Windows release host and isolate arm64 build | Treat arm64 as opt-in and validate on real hardware. |
| Install fails under Program Files | UAC denied or non-admin execution blocked | Observe UAC flow and installer context | Run elevated as intended or revise execution-level policy. Current template expects admin. |
| Installer artifact is unexpectedly large | Bundled assets, signed payload growth, or offline runtime bundling | Compare raw exe vs installer size | Audit assets; accept growth if offline WebView2 is intentionally bundled. |
| Signing fails | Wrong cert path, password, timestamp URL, or SDK missing | Run `signtool` manually with verbose logs | Fix certificate access, timestamp endpoint, and Windows SDK installation.[^signtool] |

## CI/CD readiness checklist for this repo

This section separates **what automation can do** from **what release authority must still approve**. GitHub Actions can build, package, checksum, attest, and draft a release. It does **not** own version intent, signing authority, production approval, or rollback judgment.[^github-environments][^github-attest][^wails-cli][^wails-nsis]

### Automatable now

- PR validation on every push or pull request: `bun install`, frontend build hooks, repo gate commands, and any existing test/lint/verification entrypoints.
- Windows 11 build on a pinned Windows runner with pinned Go, Bun, Wails CLI, and NSIS versions.
- `wails build -platform windows/amd64 -nsis` installer generation for the current primary target.[^wails-cli][^wails-nsis]
- Artifact collection: app executable, NSIS installer, logs, and optional dual-arch artifacts if later enabled.
- SHA-256 checksum generation and artifact upload.
- Draft GitHub release creation with attached artifacts and prefilled release-note content.
- SBOM and provenance generation where organizational policy allows it.
- Artifact attestation when the workflow has `contents: read`, `id-token: write`, and `attestations: write`.[^github-attest]

### Manual or approval-gated

- Release version selection and tag intent.
- Final release-notes approval.
- Signing authorization, certificate access, and timestamp-service approval.
- Clean Windows 11 install, upgrade, launch, uninstall, and shortcut smoke test.
- Publish or rollout approval for the production channel.
- SmartScreen observation after publication.
- Rollback decision if a release is bad.

### Prerequisites missing today

The repo is close, though it is **not CI/CD-complete today**:

- No `.github/workflows/*` file exists yet, so no hosted pipeline currently runs.
- `wails.json` still lacks the Wails `Info` release-metadata block that feeds Windows version resources and installer metadata.
- CI tool bootstrap and version pinning are not yet encoded in workflow form.
- NSIS availability is not yet validated on the chosen runner image; the workflow must prove `makensis.exe` is present or install NSIS explicitly.
- Signing policy and signing identity are still undecided.
- Release hosting and channel ownership are still undecided for manual downloads and any future updater manifest.
- A protected production environment with required reviewers is not yet configured for publish jobs.[^github-environments]
- Updater manifest policy does not exist yet; app-assisted updates need a separate publication and trust contract.

### Phased CI/CD adoption plan

1. **CI checks first** — add pull-request validation only. No release publishing.
2. **Unsigned internal artifact** — build Windows installer in CI, upload artifacts, generate checksums, keep distribution internal.
3. **Signed release candidate** — add approval-gated signing and Windows 11 smoke-test evidence.
4. **Production release with protected approval** — use a protected environment for the publish job and attach approved release notes.[^github-environments]
5. **Update-manifest publication** — only after the release-hosting, channel, signature, rollback, and updater-policy decisions are written down.

### One-page operator checklist

| Check | Owner | Evidence to retain |
|---|---|---|
| [ ] Confirm release version and target channel | Release manager | Approved version note or ticket |
| [ ] Confirm `wails.json` `Info` metadata matches the intended release | Release manager | PR link or config diff |
| [ ] Confirm pinned Go, Bun, Wails CLI, and NSIS versions for the run | Automation | Workflow log showing exact versions |
| [ ] Run repo validation and test gates on a Windows runner | Automation | Green workflow run URL |
| [ ] Build `windows/amd64` NSIS installer with Wails | Automation | Uploaded installer artifact and build log |
| [ ] Generate SHA-256 checksum | Automation | Published checksum file |
| [ ] Create draft release and upload artifacts | Automation | Draft release URL |
| [ ] Generate SBOM and/or provenance if policy enables it | Automation | Attached SBOM or attestation record |
| [ ] Approve signing authorization and use approved key path | Security | Signing approval record |
| [ ] Sign executable and installer, then verify signatures | Security | SignTool verification log or screenshot |
| [ ] Execute clean Windows 11 install / upgrade / uninstall smoke test | QA | VM notes, screenshots, or checklist artifact |
| [ ] Approve publish to production environment | Release manager | Protected-environment approval record |
| [ ] Monitor SmartScreen and early install failures after publication | Release manager | Release watch log or issue tracker note |
| [ ] Decide rollback or continue rollout | Release manager | Go/no-go decision log |

### Minimal workflow blueprint in prose/pseudocode

Keep this as a **blueprint**, not a checked-in workflow file:

1. **Trigger**
   - `pull_request` and `push` for CI validation.
   - Manual dispatch or tag push for release candidates and releases.
2. **Job: validate-windows**
   - `runs-on: windows-latest` or a pinned Windows 11-compatible runner image.
   - Checkout repo.
   - Setup pinned Go version from repo policy.
   - Setup pinned Bun version from `frontend/package.json`.
   - Install pinned Wails CLI version matching `go.mod`.
   - Validate NSIS availability with `makensis.exe` lookup or install NSIS explicitly.
   - Run `wails doctor`.
   - Run dependency restore and the repo's validation/test gates.
3. **Job: build-installer**
   - Needs `validate-windows`.
   - Run `wails build -platform windows/amd64 -nsis`.[^wails-cli][^wails-nsis]
   - Generate SHA-256 checksum.
   - Upload installer, checksum, and logs as artifacts.
   - Optionally generate SBOM/provenance inputs.
4. **Job: attest-artifacts** (optional)
   - Needs `build-installer`.
   - Permissions: `contents: read`, `id-token: write`, `attestations: write`.[^github-attest]
   - Create artifact attestation if policy enables it.
5. **Job: publish-draft**
   - Needs `build-installer` and optional attestation.
   - Create or update a draft GitHub release.
   - Attach installer and checksum.
6. **Job: publish-production**
   - Needs human-reviewed signing + QA evidence.
   - References a protected environment such as `production` so required reviewers must approve before the job runs.[^github-environments]
   - Publishes final release assets or flips the draft to published.
7. **Future job: publish-update-manifest**
   - Only after updater policy exists.
   - Publish manifest, signature, rollout metadata, and rollback controls.

### Practical boundary

The safe mental model is simple:

- **Automation** proves reproducibility, builds the installer, preserves evidence, and prepares publication.
- **Security and release owners** approve signing, publish intent, rollout, and rollback.

## Release checklist

- [ ] Confirm `wails.json` has final `Info` metadata.
- [ ] Confirm Go, Wails CLI, Bun, and NSIS versions for the release host.
- [ ] Run `wails doctor` on the release host.
- [ ] Run `bun install` successfully.
- [ ] Build `windows/amd64` installer.
- [ ] If needed, build `windows/arm64` or dual-arch variant.
- [ ] Sign app executable.
- [ ] Sign installer executable.
- [ ] Verify signatures.
- [ ] Decide update channel posture for this release: manual-only, check-only, or app-assisted installer handoff.
- [ ] If using an update manifest, generate it, sign it, and verify publication URLs.
- [ ] If using staged rollout, set the intended channel and rollout percentage.
- [ ] Test clean install on Windows 11 x64.
- [ ] Test upgrade-over-existing installation on Windows 11 x64. **Local validation required**
- [ ] Test launch from shortcut.
- [ ] Test uninstall.
- [ ] Generate SHA-256 checksums.
- [ ] Publish release notes with architecture, WebView2 notes, and update guidance.
- [ ] If using CI, publish provenance attestation. **Policy decision required**

## CI/CD outline

The following outline is suitable for GitHub Actions or an equivalent Windows CI runner.

## Suggested workflow stages

1. Checkout repo.
2. Setup Go matching repo policy.
3. Setup Bun matching `frontend/package.json`.
4. Install Wails CLI matching repo module version.
5. Install NSIS.
6. Run `bun install`.
7. Run `wails build -platform windows/amd64 -nsis`.
8. Optionally build arm64 or dual-arch artifacts.
9. Sign artifacts. **Requires organization secrets/policy**
10. Verify signatures.
11. Generate checksums.
12. If updates are enabled, generate and sign update manifest metadata.
13. Upload release artifacts.
14. Publish rollout/channel metadata if applicable.
15. Generate artifact attestation. **Requires organization policy and permissions**[^github-attest]

## GitHub Actions notes

- Use a Windows runner for least friction.
- Keep signing material outside the repository.
- Grant `id-token: write`, `contents: read`, and `attestations: write` if generating GitHub artifact attestations.[^github-attest]
- If cloud signing is used, add the vendor-specific authentication step. **Organization-specific**

## Security and distribution recommendations

1. **Ship the installer, not the raw exe, for normal end-user distribution.** The repo already has an NSIS flow and shortcut/uninstall behavior.
2. **Publish SHA-256 hashes** next to each installer.
3. **Sign and timestamp** every public Windows executable.
4. **Use least privilege consciously.** The current template is machine-wide and admin-elevated. Keep that only if Program Files installation is a deliberate product choice.
5. **Document WebView2 dependency clearly.** Say that Windows 11 usually has it already, while offline missing-runtime cases need special handling.
6. **Treat updates as a product capability, not a packaging side effect.** Keep trust decisions in backend services and keep installer replacement explicit.
7. **Publish provenance** when possible through GitHub artifact attestations or an equivalent supply-chain control.[^github-attest]
8. **Keep offline installers separate** if you later choose to bundle the standalone WebView2 runtime, because artifact size and operational expectations change materially.[^ms-webview2-distribution]

## Short recommendation for this repo

Next safe actions, in order:

1. Add a proper `Info` block to `wails.json`.
2. Decide whether the project officially uses the documented Wails v2 command `wails build -platform windows/amd64 -nsis` and retire the ambiguous `--target` wording in local notes after validation.
3. Keep the first public release amd64-only unless Windows-on-ARM support is a hard requirement.
4. Decide whether offline WebView2 support is required for your users.
5. Treat updates as a separate design track. Start with manual signed-installer distribution, then add a manifest-driven app-assisted updater only after trust, UAC, and rollback rules are documented.
6. Decide the certificate/signing operating model for both release artifacts and update metadata before automating releases.
7. Evaluate whether enterprise customers need a second channel such as winget or MSIX/App Installer.
8. Validate the full install-launch-uninstall-upgrade path on a clean Windows 11 VM before publishing.

## Sources

- Wails v2 installation: https://wails.io/docs/gettingstarted/installation/
- Wails v2 CLI reference: https://wails.io/docs/reference/cli/
- Wails v2 Windows guide: https://wails.io/docs/guides/windows/
- Wails v2 NSIS installer guide: https://wails.io/docs/guides/windows-installer/
- Microsoft WebView2 distribution guidance: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- Microsoft WebView2 download page: https://developer.microsoft.com/en-us/microsoft-edge/webview2/consumer/
- Microsoft SignTool reference: https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- Microsoft User Account Control overview: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works
- Microsoft WinGet overview: https://learn.microsoft.com/en-us/windows/package-manager/winget/
- Microsoft WinGet community manifest repository: https://github.com/microsoft/winget-pkgs
- Microsoft MSIX App Installer overview: https://learn.microsoft.com/en-us/windows/msix/app-installer/app-installer-root
- Microsoft MSIX App Installer update settings: https://learn.microsoft.com/en-us/windows/msix/app-installer/update-settings
- NSIS scripting reference: https://nsis.sourceforge.io/Docs/Chapter4.html
- NSIS download page: https://nsis.sourceforge.io/Download
- GitHub artifact attestations: https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds
- GitHub deployments and environments: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- Go install guide: https://go.dev/doc/install
- Bun installation guide: https://bun.sh/docs/installation
- Microsoft Defender SmartScreen app reputation demo: https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-demonstration-app-reputation

[^build-readme]: Repo file `build/README.md`.
[^bun-install]: Bun installation guide: https://bun.sh/docs/installation
[^go-install]: Go installation guide: https://go.dev/doc/install
[^github-attest]: GitHub artifact attestation guide: https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds
[^github-environments]: GitHub deployments and environments: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
[^ms-smartscreen-demo]: Microsoft Defender SmartScreen app reputation demo: https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-demonstration-app-reputation
[^msix-overview]: Microsoft MSIX App Installer overview: https://learn.microsoft.com/en-us/windows/msix/app-installer/app-installer-root
[^msix-update-settings]: Microsoft MSIX App Installer update settings: https://learn.microsoft.com/en-us/windows/msix/app-installer/update-settings
[^ms-webview2-distribution]: Microsoft WebView2 distribution guidance: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
[^nsis-ch4]: NSIS Chapter 4 scripting reference: https://nsis.sourceforge.io/Docs/Chapter4.html
[^nsis-download]: NSIS download page: https://nsis.sourceforge.io/Download
[^project-nsi]: Repo file `build/windows/installer/project.nsi`.
[^signtool]: Microsoft SignTool reference: https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
[^uac]: Microsoft User Account Control overview: https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-it-works
[^winget-overview]: Microsoft WinGet overview: https://learn.microsoft.com/en-us/windows/package-manager/winget/
[^winget-pkgs]: Microsoft WinGet community manifest repository: https://github.com/microsoft/winget-pkgs
[^wails-cli]: Wails v2 CLI reference: https://wails.io/docs/reference/cli/
[^wails-install]: Wails v2 installation guide: https://wails.io/docs/gettingstarted/installation/
[^wails-nsis]: Wails v2 NSIS installer guide: https://wails.io/docs/guides/windows-installer/
[^wails-windows]: Wails v2 Windows guide: https://wails.io/docs/guides/windows/
[^architecture-doc]: Repo file `docs/architecture.md`.
