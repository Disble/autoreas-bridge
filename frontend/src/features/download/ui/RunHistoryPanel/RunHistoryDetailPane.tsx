import { Alert, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import dangerIcon from '@iconify-icons/solar/danger-circle-bold';
import historyIcon from '@iconify-icons/solar/history-bold';
import historyDuotoneIcon from '@iconify-icons/solar/history-bold-duotone';
import listCappedIcon from '@iconify-icons/solar/danger-triangle-bold';
import { AwaitingSelectionPane } from '../../../../shared/ui/AwaitingSelectionPane/AwaitingSelectionPane';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { RUN_HISTORY_COPY_CONFIRMATIONS, RUN_HISTORY_DETAIL_AWAITING, RUN_HISTORY_PANE_CLASS, RUN_HISTORY_TONE_ICON_CLASS } from './run-history-panel.constants';
import type { RunHistoryDetailPaneProps } from './run-history-panel.types';
import { RunHistoryOutcomeGroup } from './RunHistoryOutcomeGroup';
import { RunProgressBar } from './RunProgressBar';

/**
 * Renders the master/detail view's right-hand pane: a "select a run" prompt
 * when nothing is selected, otherwise the run id with its status, the anime
 * and episode totals, the episodes bar, the error summary verbatim, and the
 * per-anime outcome groups.
 */
export function RunHistoryDetailPane({ detail, covers, onCopy, onEditAnime }: Readonly<RunHistoryDetailPaneProps>) {
  if (detail === undefined) {
    return (
      <div className={RUN_HISTORY_PANE_CLASS}>
        <AwaitingSelectionPane description={RUN_HISTORY_DETAIL_AWAITING.description} icon={historyDuotoneIcon} title={RUN_HISTORY_DETAIL_AWAITING.title} />
      </div>
    );
  }

  const { run, status, storyNote } = detail;

  return (
    <div aria-live="polite" className={RUN_HISTORY_PANE_CLASS}>
      <div className="flex items-center gap-1">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
          Run <span className="font-mono font-normal">{run.runId}</span>
        </h3>
        <IconActionButton ariaLabel="Copy run id" icon={copyIcon} tooltip="Copy run id" variant="ghost" onPress={() => onCopy(run.runId, RUN_HISTORY_COPY_CONFIRMATIONS.runId)} />
        {status === undefined ? null : (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-sm text-foreground" data-testid="run-status">
            <Icon
              aria-hidden="true"
              className={`size-4 ${RUN_HISTORY_TONE_ICON_CLASS[status.tone]} ${status.tone === 'accent' ? 'animate-spin motion-reduce:animate-none [animation-duration:1.6s]' : ''}`}
              icon={status.icon}
            />
            {status.label}
          </span>
        )}
      </div>

      <p className="flex items-center gap-4 text-[15px] text-muted tabular-nums">
        <span>
          <b className="font-semibold text-foreground">{run.animesChecked}</b> anime checked
        </span>
        <span>
          <b className="font-semibold text-foreground">{run.episodesFound}</b> episodes found
        </span>
        {storyNote === undefined ? null : (
          <Tooltip>
            <span aria-label={storyNote.label} className="ml-auto inline-grid text-muted" data-story-note={storyNote.kind} role="img">
              <Icon aria-hidden="true" className="size-[18px]" icon={storyNote.kind === 'expired' ? historyIcon : listCappedIcon} />
            </span>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              {storyNote.label}
            </Tooltip.Content>
          </Tooltip>
        )}
      </p>

      {detail.bar === undefined ? null : <RunProgressBar bar={detail.bar} />}

      {run.errorSummary === undefined ? null : (
        <Alert role="alert" status="danger">
          <Alert.Indicator>
            <Icon aria-hidden="true" className="size-[18px] text-danger" icon={dangerIcon} />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Description className="break-words font-mono text-[13px] text-foreground">{run.errorSummary}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {detail.groups.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {detail.groups.map((group) => (
            <RunHistoryOutcomeGroup covers={covers} group={group} key={`${run.runId}-${group.id}`} onCopy={onCopy} onEditAnime={onEditAnime} />
          ))}
        </div>
      )}
    </div>
  );
}
