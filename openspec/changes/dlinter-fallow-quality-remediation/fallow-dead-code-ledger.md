# Fallow Dead-Code Ledger - Work Unit 2A

## Scope

- Captured: 2026-07-12
- Source command: `bun --cwd="frontend" run fallow dead-code --format json --quiet`
- Result: 79 findings in 162 ms with 112 discovered entry points.
- Trace prefix `D`: `bun --cwd="frontend" run fallow dead-code --format json --quiet`
- Every `D --trace` and `D --trace-file` command below completed successfully.
- This ledger is an evidence-only slice. It changes no frontend source, test, generated Wails output, package manifest, lockfile, or Fallow configuration.

## Evidence Keys

| Key | Test or framework contract evidence |
|---|---|
| `COL` | `AGENTS.md` requires each complex feature module to retain an `index.ts` and colocated `*.types.ts` files. |
| `VITEST` | `frontend/package.json` runs `vitest run`; `frontend/vite.config.ts` configures the jsdom test environment and `src/test/setup.ts`. |
| `HELPER` | The colocated helper test discovered as a Vitest entry point exercises the containing feature behavior; task 2.2 MUST add RED coverage before changing an export. |
| `BUILD` | `frontend/package.json` and `frontend/vite.config.ts` establish ESLint, Tailwind, and Vite as build-time tooling. |
| `MANIFEST` | A production source import requires a package-manifest ownership decision in task 2.3. |

## Per-Finding Ledger

### Unused Files

| Candidate identity | Command used | Reachability evidence | Contract evidence | Classification | Disposition |
|---|---|---|---|---|---|
| `scripts/__tests__/check-file-size-warnings.test.mjs` | `D --trace-file scripts/__tests__/check-file-size-warnings.test.mjs` | unreachable; imports `scripts/check-file-size-warnings.mjs`; no static importer | `VITEST` discovers `*.test.mjs` independently | analyzer-limited | Retain; assess a narrow test-discovery solution only in 2.3. |
| `src/features/anime-detail/ui/AnimeDetail/anime-detail.schema.ts` | `D --trace-file src/features/anime-detail/ui/AnimeDetail/anime-detail.schema.ts` | unreachable; `animeRepeticionSchema` has zero references | `COL`, `VITEST` | ambiguous | Retain pending schema ownership review. |
| `src/features/anime-detail/ui/AnimeDetail/index.ts` | `D --trace-file src/features/anime-detail/ui/AnimeDetail/index.ts` | unreachable; re-exports `AnimeDetail` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/catalog/ui/CatalogFilterBar/index.ts` | `D --trace-file src/features/catalog/ui/CatalogFilterBar/index.ts` | unreachable; re-exports `CatalogFilterBar` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/catalog/ui/CatalogPanel/catalog-panel.schema.ts` | `D --trace-file src/features/catalog/ui/CatalogPanel/catalog-panel.schema.ts` | unreachable; `animeSchema` has zero references | `COL`, `VITEST` | ambiguous | Retain pending schema ownership review. |
| `src/features/catalog/ui/CatalogPanel/index.ts` | `D --trace-file src/features/catalog/ui/CatalogPanel/index.ts` | unreachable; re-exports `CatalogPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.schema.ts` | `D --trace-file src/features/chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.schema.ts` | unreachable; `ChapterSchedulePanelSchema` has zero references | `COL`, `VITEST` | ambiguous | Retain pending schema ownership review. |
| `src/features/chapters/ui/ChapterSchedulePanel/index.ts` | `D --trace-file src/features/chapters/ui/ChapterSchedulePanel/index.ts` | unreachable; re-exports `ChapterSchedulePanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/dashboard/index.ts` | `D --trace-file src/features/dashboard/index.ts` | unreachable; re-exports `BridgeDashboard` through its UI barrel | `COL`, `VITEST` | intentional/reachable | Retain feature boundary. |
| `src/features/dashboard/ui/BridgeDashboard/bridge-dashboard.types.ts` | `D --trace-file src/features/dashboard/ui/BridgeDashboard/bridge-dashboard.types.ts` | unreachable; `BridgeDashboardProps` has zero external references | `COL`, `VITEST` | intentional/reachable | Retain colocated type boundary. |
| `src/features/dashboard/ui/BridgeDashboard/index.ts` | `D --trace-file src/features/dashboard/ui/BridgeDashboard/index.ts` | unreachable; imported by `src/features/dashboard/index.ts` and re-exports `BridgeDashboard` | `COL`, `VITEST` | intentional/reachable | Retain module boundary. |
| `src/features/dashboard/ui/BridgeStatusCard/bridge-status-card.types.ts` | `D --trace-file src/features/dashboard/ui/BridgeStatusCard/bridge-status-card.types.ts` | unreachable; `BridgeStatusCardProps` has zero external references | `COL`, `VITEST` | intentional/reachable | Retain colocated type boundary. |
| `src/features/dashboard/ui/BridgeStatusCard/index.ts` | `D --trace-file src/features/dashboard/ui/BridgeStatusCard/index.ts` | unreachable; re-exports `BridgeStatusCard` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/dashboard/ui/ObservabilityPanel/index.ts` | `D --trace-file src/features/dashboard/ui/ObservabilityPanel/index.ts` | unreachable; re-exports `ObservabilityPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/dashboard/ui/PairingPanel/index.ts` | `D --trace-file src/features/dashboard/ui/PairingPanel/index.ts` | unreachable; re-exports `PairingPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/dashboard/ui/SyncingAnimePanel/index.ts` | `D --trace-file src/features/dashboard/ui/SyncingAnimePanel/index.ts` | unreachable; re-exports `SyncingAnimePanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/dashboard/ui/SyncingAnimePanel/syncing-anime-panel.schema.ts` | `D --trace-file src/features/dashboard/ui/SyncingAnimePanel/syncing-anime-panel.schema.ts` | unreachable; `SyncingAnimePanelSchema` has zero references | `COL`, `VITEST` | ambiguous | Retain pending schema ownership review. |
| `src/features/download/ui/HosterPriorityEditor/index.ts` | `D --trace-file src/features/download/ui/HosterPriorityEditor/index.ts` | unreachable; re-exports `HosterPriorityEditor` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/download/ui/JDConfigPanel/index.ts` | `D --trace-file src/features/download/ui/JDConfigPanel/index.ts` | unreachable; re-exports `JDConfigPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/download/ui/ManualTriggerButton/index.ts` | `D --trace-file src/features/download/ui/ManualTriggerButton/index.ts` | unreachable; re-exports `ManualTriggerButton` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/download/ui/RunHistoryPanel/index.ts` | `D --trace-file src/features/download/ui/RunHistoryPanel/index.ts` | unreachable; re-exports `RunHistoryPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/download/ui/SchedulePanel/index.ts` | `D --trace-file src/features/download/ui/SchedulePanel/index.ts` | unreachable; re-exports `SchedulePanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/download/ui/SoloAnimeDownloadPanel/index.ts` | `D --trace-file src/features/download/ui/SoloAnimeDownloadPanel/index.ts` | unreachable; re-exports `SoloAnimeDownloadPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/history/ui/HistoryTable/index.ts` | `D --trace-file src/features/history/ui/HistoryTable/index.ts` | unreachable; re-exports `HistoryTable` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/network/index.ts` | `D --trace-file src/features/network/index.ts` | unreachable; re-exports `NetworkPanel` through its UI barrel | `COL`, `VITEST` | intentional/reachable | Retain feature boundary. |
| `src/features/network/ui/NetworkDetail/index.ts` | `D --trace-file src/features/network/ui/NetworkDetail/index.ts` | unreachable; re-exports `NetworkDetail` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/network/ui/NetworkFilterBar/index.ts` | `D --trace-file src/features/network/ui/NetworkFilterBar/index.ts` | unreachable; re-exports `NetworkFilterBar` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/network/ui/NetworkPanel/index.ts` | `D --trace-file src/features/network/ui/NetworkPanel/index.ts` | unreachable; imported by `src/features/network/index.ts` and re-exports `NetworkPanel` | `COL`, `VITEST` | intentional/reachable | Retain module boundary. |
| `src/features/network/ui/NetworkTable/index.ts` | `D --trace-file src/features/network/ui/NetworkTable/index.ts` | unreachable; re-exports `NetworkTable` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/preferences/ui/ConnectedDevicesPanel/connected-devices-panel.schema.ts` | `D --trace-file src/features/preferences/ui/ConnectedDevicesPanel/connected-devices-panel.schema.ts` | unreachable; `ConnectedDevicesPanelSchema` has zero references | `COL`, `VITEST` | ambiguous | Retain pending schema ownership review. |
| `src/features/preferences/ui/ConnectedDevicesPanel/index.ts` | `D --trace-file src/features/preferences/ui/ConnectedDevicesPanel/index.ts` | unreachable; re-exports `ConnectedDevicesPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/preferences/ui/DownloadsRootPanel/index.ts` | `D --trace-file src/features/preferences/ui/DownloadsRootPanel/index.ts` | unreachable; re-exports `DownloadsRootPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/DailyBoard/index.ts` | `D --trace-file src/features/season/ui/DailyBoard/index.ts` | unreachable; re-exports `DailyBoard` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/EvaluationPanel/index.ts` | `D --trace-file src/features/season/ui/EvaluationPanel/index.ts` | unreachable; re-exports `EvaluationPanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/IntakePanel/index.ts` | `D --trace-file src/features/season/ui/IntakePanel/index.ts` | unreachable; re-exports `IntakePanel` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/OrderingBoard/index.ts` | `D --trace-file src/features/season/ui/OrderingBoard/index.ts` | unreachable; re-exports `OrderingBoard` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/RateAnimeModal/index.ts` | `D --trace-file src/features/season/ui/RateAnimeModal/index.ts` | unreachable; re-exports `RateAnimeModal` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/SeasonRateAction/index.ts` | `D --trace-file src/features/season/ui/SeasonRateAction/index.ts` | unreachable; re-exports `SeasonRateAction` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/SeasonWorkspace/index.ts` | `D --trace-file src/features/season/ui/SeasonWorkspace/index.ts` | unreachable; re-exports `SeasonWorkspace` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |
| `src/features/season/ui/SelectionBoard/index.ts` | `D --trace-file src/features/season/ui/SelectionBoard/index.ts` | unreachable; re-exports `SelectionBoard` | `COL`, `VITEST` | intentional/reachable | Retain required module boundary. |

### Unused Exports

All rows below have `file_reachable: true`, `is_used: false`, no direct references, and no re-export chain. Their symbols remain used inside their own files where stated. The confirmed decision covers only removal of the public `export`, never behavior. `HELPER` requires a task-2.2 RED test before that edit.

| Candidate identity | Command used | Reachability evidence | Contract evidence | Classification | Disposition |
|---|---|---|---|---|---|
| `anime-detail.helpers.ts:normalizeAnimeDetailPortadaUrl` | `D --trace src/features/anime-detail/ui/AnimeDetail/anime-detail.helpers.ts:normalizeAnimeDetailPortadaUrl` | internal use by `buildAnimeDetailViewModel`; no importers | `HELPER` (`AnimeDetail/__tests__/anime-detail.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.constants.ts:CATALOG_PANEL_LIST_LABEL` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.constants.ts:CATALOG_PANEL_LIST_LABEL` | no references | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.constants.ts:ANIME_TIPO_OPTIONS` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.constants.ts:ANIME_TIPO_OPTIONS` | no references | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:getAnimeGapLabel` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:getAnimeGapLabel` | internal use by row model creation | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:normalizeAnimeQuery` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:normalizeAnimeQuery` | internal use by `matchesAnimeQuery` | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeQuery` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeQuery` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeEstado` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeEstado` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeActivo` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeActivo` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeTipo` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeTipo` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeDia` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeDia` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `catalog-panel.helpers.ts:matchesAnimeGeneros` | `D --trace src/features/catalog/ui/CatalogPanel/catalog-panel.helpers.ts:matchesAnimeGeneros` | internal use by filtering | `HELPER` (`CatalogPanel/__tests__/catalog-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `chapter-schedule-panel.helpers.ts:formatChapterNumber` | `D --trace src/features/chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.helpers.ts:formatChapterNumber` | internal use by chapter labels | `HELPER` (`ChapterSchedulePanel/__tests__/chapter-schedule-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `observability-panel.helpers.ts:getSummaryLabels` | `D --trace src/features/dashboard/ui/ObservabilityPanel/observability-panel.helpers.ts:getSummaryLabels` | internal use by log-row construction | `HELPER` (`ObservabilityPanel/__tests__/observability-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `pairing-panel.helpers.ts:DEFAULT_PAIRING_QR_OPTIONS` | `D --trace src/features/dashboard/ui/PairingPanel/pairing-panel.helpers.ts:DEFAULT_PAIRING_QR_OPTIONS` | default used by `buildPairingQrImageUrl`; no importers | `HELPER` (`PairingPanel/__tests__/pairing-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `schedule-panel.constants.ts:SCHEDULE_PANEL_EMPTY_CONFIG` | `D --trace src/features/download/ui/SchedulePanel/schedule-panel.constants.ts:SCHEDULE_PANEL_EMPTY_CONFIG` | no references | `HELPER` (`SchedulePanel/__tests__/schedule-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `solo-anime-download-panel.constants.ts:SOLO_ANIME_DOWNLOAD_EMPTY_ITEMS` | `D --trace src/features/download/ui/SoloAnimeDownloadPanel/solo-anime-download-panel.constants.ts:SOLO_ANIME_DOWNLOAD_EMPTY_ITEMS` | no references | `HELPER` (`SoloAnimeDownloadPanel/__tests__/solo-anime-download-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `network-panel.helpers.ts:formatNetworkTime` | `D --trace src/features/network/ui/NetworkPanel/network-panel.helpers.ts:formatNetworkTime` | internal use by view-model builders | `HELPER` (`NetworkPanel/__tests__/network-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `network-panel.helpers.ts:getNetworkMessage` | `D --trace src/features/network/ui/NetworkPanel/network-panel.helpers.ts:getNetworkMessage` | internal use by view-model builders | `HELPER` (`NetworkPanel/__tests__/network-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `network-panel.helpers.ts:getNetworkMetadataEntries` | `D --trace src/features/network/ui/NetworkPanel/network-panel.helpers.ts:getNetworkMetadataEntries` | internal use by detail builder | `HELPER` (`NetworkPanel/__tests__/network-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `network-panel.helpers.ts:getNetworkDetailFields` | `D --trace src/features/network/ui/NetworkPanel/network-panel.helpers.ts:getNetworkDetailFields` | internal use by selected detail builder | `HELPER` (`NetworkPanel/__tests__/network-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `network-panel.helpers.ts:getNetworkTraceEntries` | `D --trace src/features/network/ui/NetworkPanel/network-panel.helpers.ts:getNetworkTraceEntries` | internal use by selected detail builder | `HELPER` (`NetworkPanel/__tests__/network-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `intake-panel.helpers.ts:isEditableRow` | `D --trace src/features/season/ui/IntakePanel/intake-panel.helpers.ts:isEditableRow` | internal use by row projection | `HELPER` (`IntakePanel/__tests__/intake-panel.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `ordering-board.helpers.ts:RAIL` | `D --trace src/features/season/ui/OrderingBoard/ordering-board.helpers.ts:RAIL` | internal use by board helper operations | `HELPER` (`OrderingBoard/__tests__/ordering-board.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `ordering-board.helpers.ts:containerFor` | `D --trace src/features/season/ui/OrderingBoard/ordering-board.helpers.ts:containerFor` | internal helper use | `HELPER` (`OrderingBoard/__tests__/ordering-board.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `ordering-board.helpers.ts:locationFor` | `D --trace src/features/season/ui/OrderingBoard/ordering-board.helpers.ts:locationFor` | internal helper use | `HELPER` (`OrderingBoard/__tests__/ordering-board.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `season-workspace.helpers.ts:formatSeasonCreatedLabel` | `D --trace src/features/season/ui/SeasonWorkspace/season-workspace.helpers.ts:formatSeasonCreatedLabel` | internal use by season view models | `HELPER` (`SeasonWorkspace/__tests__/season-workspace.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |
| `selection-board.constants.ts:CONSIDERATION_NONE` | `D --trace src/features/season/ui/SelectionBoard/selection-board.constants.ts:CONSIDERATION_NONE` | internal use by the options list | `HELPER` (`SelectionBoard/__tests__/selection-board.helpers.test.ts`) | confirmed-unused | Queue export removal in 2.2. |

### Unused Types

Each trace reports an otherwise reachable file with no external reference to the named type. Removing only the type export preserves its local use. Existing component or hook tests are the safety net; task 2.2 MUST add RED coverage when an observable behavior can be affected.

| Candidate identity | Command used | Reachability evidence | Contract evidence | Classification | Disposition |
|---|---|---|---|---|---|
| `observability-panel.types.ts:ObservabilityPanelProps` | `D --trace src/features/dashboard/ui/ObservabilityPanel/observability-panel.types.ts:ObservabilityPanelProps` | reachable file; no references or re-exports | `COL`, `VITEST` (`ObservabilityPanel/__tests__/ObservabilityPanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `pairing-panel.types.ts:PairingPanelProps` | `D --trace src/features/dashboard/ui/PairingPanel/pairing-panel.types.ts:PairingPanelProps` | reachable file; no references or re-exports | `COL`, `VITEST` (`PairingPanel/__tests__/PairingPanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `jdconfig-panel.types.ts:JDConfigPanelViewModel` | `D --trace src/features/download/ui/JDConfigPanel/jdconfig-panel.types.ts:JDConfigPanelViewModel` | reachable file; no references or re-exports | `COL`, `VITEST` (`JDConfigPanel/__tests__/JDConfigPanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `run-history-panel.types.ts:RunHistoryPanelState` | `D --trace src/features/download/ui/RunHistoryPanel/run-history-panel.types.ts:RunHistoryPanelState` | reachable file; no references or re-exports | `COL`, `VITEST` (`RunHistoryPanel/__tests__/RunHistoryPanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `run-history-panel.types.ts:ManualLink` | `D --trace src/features/download/ui/RunHistoryPanel/run-history-panel.types.ts:ManualLink` | reachable file; no references or re-exports | `COL`, `VITEST`; source contract remains `shared/contracts/download.types.ts:ManualLink` | confirmed-unused | Queue re-export removal in 2.2. |
| `schedule-panel.types.ts:SchedulePanelStatus` | `D --trace src/features/download/ui/SchedulePanel/schedule-panel.types.ts:SchedulePanelStatus` | reachable file; no references or re-exports | `COL`, `VITEST` (`SchedulePanel/__tests__/SchedulePanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `solo-anime-download-panel.types.ts:SoloAnimeDownloadViewModel` | `D --trace src/features/download/ui/SoloAnimeDownloadPanel/solo-anime-download-panel.types.ts:SoloAnimeDownloadViewModel` | reachable file; no references or re-exports | `COL`, `VITEST` (`SoloAnimeDownloadPanel/__tests__/SoloAnimeDownloadPanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `daily-board.types.ts:DailyBoardProps` | `D --trace src/features/season/ui/DailyBoard/daily-board.types.ts:DailyBoardProps` | reachable file; no references or re-exports | `COL`, `VITEST` (`DailyBoard/__tests__/DailyBoard.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |
| `intake-panel.types.ts:IntakePanelProps` | `D --trace src/features/season/ui/IntakePanel/intake-panel.types.ts:IntakePanelProps` | reachable file; no references or re-exports | `COL`, `VITEST` (`IntakePanel/__tests__/IntakePanel.test.tsx`) | confirmed-unused | Queue type-export removal in 2.2. |

### Dependency Findings

| Candidate identity | Command used | Reachability evidence | Contract evidence | Classification | Disposition |
|---|---|---|---|---|---|
| `react-aria-components` (unlisted dependency) | `D --trace-dependency react-aria-components` | used six times by `HosterPriorityEditor.tsx` and its test | `MANIFEST`; runtime source import exists | ambiguous | Task 2.3 decides direct dependency ownership; do not add an ignore. |
| `eslint` (dev dependency in production) | `D --trace-dependency eslint` | used by `scripts/check-file-size-warnings.mjs` only | `BUILD` | analyzer-limited | Retain as development tooling; assess only an item-specific tool classification in 2.3. |
| `tailwindcss` (dev dependency in production) | `D --trace-dependency tailwindcss` | imported by `src/style.css` for Vite processing | `BUILD` | analyzer-limited | Retain as development tooling; assess only an item-specific tool classification in 2.3. |

## Classification Metrics

| Classification | Count | Findings |
|---|---:|---|
| confirmed-unused | 36 | 27 exports and 9 types; export/type boundary removal is deferred to task 2.2. |
| intentional/reachable | 34 | 32 `index.ts` module boundaries and 2 colocated type files required by frontend architecture. |
| analyzer-limited | 3 | One Vitest-discovered script test plus two build-time dependencies. |
| ambiguous | 6 | Five unused schemas and the unlisted `react-aria-components` dependency. |
| total | 79 | Matches the exact dead-code JSON command above. |

## Follow-On Constraints

- Task 2.2 owns only confirmed-unused export/type removals and begins with focused RED tests.
- Task 2.3 owns dependency and retention decisions. It MUST preserve the existing narrow generated-code exclusion, must not add a broad ignore or baseline, and must not weaken a rule.
- Schemas, barrels, tests, fixtures, generated Wails code, package files, and unrelated work remain untouched by this work unit.
