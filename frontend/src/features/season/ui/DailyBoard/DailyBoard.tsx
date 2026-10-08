import linkIcon from '@iconify-icons/solar/link-round-broken';
import { Icon } from '@iconify/react';
import { Alert, Button, Tooltip } from '@heroui/react';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import { getGradeChip } from '../EvaluationPanel/evaluation-panel.helpers';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import {
  DAILY_BOARD_LOADING_LABEL,
  DAILY_BOARD_SECTION_COPY,
  DAILY_BOARD_SKELETON_BAR_CLASS,
  DAILY_BOARD_SKELETON_ROW_COUNT,
  VER_HOY_LIST_CLASS,
  VISTO_LIST_CLASS,
} from './daily-board.constants';
import { formatAvailableEpisodes, hasBoardRows, isDailyBoardSectionShown } from './daily-board.helpers';
import { DailyBoardPlainCard } from './DailyBoardPlainCard';
import { DailyBoardSectionCard } from './DailyBoardSectionCard';
import { DailyBoardWatchList } from './DailyBoardWatchList';
import { useDailyBoard } from './use-daily-board';

/**
 * DailyBoard is the conveyor below the intake: created animes grouped by
 * section. Pick from the Sin ver pool which to watch today → Ver hoy
 * (auto-downloads); Ver hoy drains automatically as episodes are watched; Visto
 * flows on to evaluation. Each section is the same card (`DailyBoardSectionCard`).
 * An open season renders a section only once it holds an anime, so the board
 * grows with the season; a read-only season always renders all three, an empty
 * one with its compact empty state. Sections never collapse, so a top-to-bottom
 * scan finds every anime, and every row shows the anime's cover.
 *
 * A closed season's history is immutable: its sections come from the Daily
 * board stored at close, never from live sections. While that read is in flight
 * a placeholder replaces the board; a failed read shows its alert; a season
 * that closed before the board was recorded shows one plain list of its animes
 * (`DailyBoardPlainCard`) and claims no section.
 *
 * Ver hoy rows carry their weekday chip in an open season only (it reads the
 * live section); Visto rows carry their first-episode
 * grade state instead, because Visto means "ready for evaluation" and whether
 * an anime is graded yet is the datum worth scanning for (the grade is
 * season-owned data, while the weekday derives from the live section and
 * belongs to Selection and Ordering).
 *
 * "Re-check now" shows whenever a section does (never read-only): it re-probes
 * availability for the uncreated intake rows and refreshes the Sin ver rows'
 * episode counts. All Wails I/O and state live in the colocated `useDailyBoard`
 * hook.
 *
 * No list here renders progressively: a season's intake is a few dozen animes
 * (Visto peaks around 30), far below the ~100 rows the progressive-list rule
 * targets.
 */
export function DailyBoard() {
  const {
    readOnly,
    boardMode,
    sections,
    plainRows,
    historyError,
    selected,
    toggleSelect,
    onSendToVerHoy,
    downloadNotice,
    onDownloadNow,
    onDismissNotice,
    onRecheck,
    errorMessage,
    getCoverThumb,
    getVerHoyRowChip,
  } = useDailyBoard();

  return (
    <section className="flex flex-col gap-4">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {downloadNotice !== null && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              Sent to Ver hoy after today&apos;s {downloadNotice.downloadTime || 'scheduled'} auto-download. Download now
              so you have episodes to watch today.
            </Alert.Description>
          </Alert.Content>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onPress={onDownloadNow}>
              Download now
            </Button>
            <Button size="sm" variant="tertiary" onPress={onDismissNotice}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {historyError !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{historyError}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {boardMode === 'loading' && (
        <LoadingBars
          barClassName={DAILY_BOARD_SKELETON_BAR_CLASS}
          count={DAILY_BOARD_SKELETON_ROW_COUNT}
          label={DAILY_BOARD_LOADING_LABEL}
        />
      )}

      {boardMode === 'plain' && <DailyBoardPlainCard getCoverThumb={getCoverThumb} rows={plainRows} />}

      {!readOnly && hasBoardRows(sections) && (
        <div className="flex items-center gap-3">
          <Button variant="tertiary" onPress={onRecheck}>
            Re-check now
          </Button>
        </div>
      )}

      {isDailyBoardSectionShown(boardMode, readOnly, sections.sinVer.length) && (
        <DailyBoardSectionCard
          copy={DAILY_BOARD_SECTION_COPY.sinVer}
          count={sections.sinVer.length}
          countColor="default"
          footer={
            readOnly ? null : (
              <div className="mt-3 flex items-center gap-3">
                <Button isDisabled={selected.size === 0} variant="primary" onPress={onSendToVerHoy}>
                  Send to Ver hoy
                </Button>
                <span className="text-sm text-muted">{selected.size} selected for today</span>
              </div>
            )
          }
        >
          <ul aria-label="Sin ver" className="flex flex-col gap-2">
            {sections.sinVer.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3">
                <SeasonCoverThumb {...getCoverThumb(row.animeId)} />
                {readOnly ? (
                  <span className="text-sm text-foreground">{row.rawName}</span>
                ) : (
                  <LabeledCheckbox isSelected={selected.has(row.animeId)} onChange={() => toggleSelect(row.animeId)}>
                    {row.rawName}
                  </LabeledCheckbox>
                )}
                <span className="text-xs text-muted">{formatAvailableEpisodes(row.availableEpisodes)}</span>
                <div className="ml-auto flex items-center gap-2">
                  {row.matchedSlug !== '' && (
                    <Tooltip>
                      <a
                        aria-label={`Open the page for ${row.rawName}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-accent"
                        href={row.matchedSlug}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Icon className="size-4" icon={linkIcon} />
                      </a>
                      <Tooltip.Content showArrow>
                        <Tooltip.Arrow />
                        Open page
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </DailyBoardSectionCard>
      )}

      {isDailyBoardSectionShown(boardMode, readOnly, sections.verHoy.length) && (
        <DailyBoardSectionCard
          copy={DAILY_BOARD_SECTION_COPY.verHoy}
          count={sections.verHoy.length}
          countColor="accent"
        >
          <DailyBoardWatchList getCoverThumb={getCoverThumb} getRowChip={getVerHoyRowChip} label="Ver hoy" listClassName={VER_HOY_LIST_CLASS} rows={sections.verHoy} />
        </DailyBoardSectionCard>
      )}

      {isDailyBoardSectionShown(boardMode, readOnly, sections.visto.length) && (
        <DailyBoardSectionCard
          copy={DAILY_BOARD_SECTION_COPY.visto}
          count={sections.visto.length}
          countColor="success"
        >
          <DailyBoardWatchList getCoverThumb={getCoverThumb} getRowChip={getGradeChip} label="Visto" listClassName={VISTO_LIST_CLASS} rows={sections.visto} />
        </DailyBoardSectionCard>
      )}
    </section>
  );
}
