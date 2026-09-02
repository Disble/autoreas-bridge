# App Icons

Every application icon derives from **one** master: `build/appicon.png`
(1024×1024 RGBA, the white "A" on the brand blue field). Nothing else is
hand-maintained.

## Targets

| File | Sizes | Consumer |
| --- | --- | --- |
| `build/appicon.png` | 1024 | **master** — Wails, and the source CI resizes for Linux |
| `build/windows/icon.ico` | 16, 24, 32, 48, 64, 128, 256 | the `.exe` and the NSIS installer (`MUI_ICON` / `MUI_UNICON`) |
| `internal/tray/tray-icon.ico` | 16, 24, 32, 48 | embedded into the binary by `//go:embed` for the system tray |
| `usr/share/icons/hicolor/**` | 48, 64, 128, 256, 512 | Linux desktop entry and AppStream metainfo |

The Linux sizes are **not** committed: `.github/workflows/build-linux.yml`
renders them from `build/appicon.png` at package time.

## Regenerating

```sh
go run ./tools/genicons          # rewrite both .ico files from the master
go run ./tools/genicons -check   # fail if either no longer matches
```

Change the artwork by replacing `build/appicon.png`, then run the generator.
Never edit an `.ico` by hand — the `app-icons` job in `lefthook.yml` runs
`-check` whenever the master, a generated icon, or the generator itself is
staged, and it will reject the commit.

## Why the encoder looks the way it does

- **Area-average downsampling.** The ratios here reach 64:1 (1024 → 16), where
  area averaging is the correct antialiasing filter. A sharpening kernel such as
  Lanczos rings on the mark's hairline stroke tips instead of resolving them.
- **DIB up to 64px, PNG above it.** NSIS reads `MUI_ICON` entries as
  device-independent bitmaps, so every size an installer might draw stays an
  uncompressed bitmap. Above 64px the Windows shell is the only consumer and PNG
  compression keeps the file reasonable.
- **Byte-for-byte comparison in `-check`.** The encoder is deterministic, so the
  guard is a plain byte compare and its remedy is always the same: run the
  generator. A Go toolchain upgrade that changed PNG output would surface here as
  a regeneration, not as a silent drift.

## Drift this replaced

Recorded because the code was the runtime truth and the docs were not:

- `resources/tray-icon.ico` was tracked but **referenced by nothing**. It carried
  the *pre-rebrand* artwork (a wave/whale mark) while the embedded
  `internal/tray/tray-icon.ico` carried the current "A" — same 4286-byte size,
  different content. SDD-13's verify report flagged the split path in April 2026
  and it survived because no gate compared them. Deleted.
- `build/windows/icon.ico` held a **single 32×32 entry**, so Explorer upscaled a
  32px bitmap for its 48px list view and its 256px extra-large view. Now seven
  sizes.
- `frontend/src/assets/images/logo-universal.png` was the Wails template logo
  with zero importers anywhere in `frontend/`. Deleted.

`resources/autoreas-bridge-full-icon.png` (2048×2048, also pre-rebrand artwork)
is gitignored and exists only in working copies. It is not part of any build and
was left untouched.
