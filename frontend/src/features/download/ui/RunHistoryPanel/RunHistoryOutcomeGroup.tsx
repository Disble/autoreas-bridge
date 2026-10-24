import { Disclosure } from '@heroui/react';
import { Icon } from '@iconify/react';
import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { RUN_HISTORY_COPY_CONFIRMATIONS, RUN_HISTORY_TONE_ICON_CLASS, RUN_HISTORY_UNRECORDED_COPY } from './run-history-panel.constants';
import type { RunHistoryOutcomeGroupProps } from './run-history-panel.types';
import { RunHistoryAnimeRow } from './RunHistoryAnimeRow';

/**
 * One outcome of the selected run (Failed, Not attempted or Downloading,
 * Downloaded, Skipped, Up to date): its icon, label and count, and, when the
 * run's story is stored, a collapsible list of the anime it names. Without a
 * story the group is its header alone.
 */
export function RunHistoryOutcomeGroup({ group, covers, onCopy, onEditAnime, onOpenLink }: Readonly<RunHistoryOutcomeGroupProps>) {
  const header = (
    <>
      <span className={`inline-grid ${RUN_HISTORY_TONE_ICON_CLASS[group.tone]}`}>
        <Icon aria-hidden="true" className={`size-[18px] ${group.isLive ? 'animate-spin motion-reduce:animate-none [animation-duration:1.6s]' : ''}`} icon={group.icon} />
      </span>
      <span className="text-[15px] font-semibold text-foreground">{group.label}</span>
      <span className="text-[15px] font-semibold text-muted tabular-nums">{group.count}</span>
    </>
  );

  if (group.rows === undefined) {
    return (
      <section aria-label={`${group.label} ${group.count}`} className="rounded-xl bg-surface" data-group={group.id}>
        <div className="flex items-center gap-2.5 py-2.5 pr-3 pl-3.5">{header}</div>
      </section>
    );
  }

  return (
    <Disclosure className="rounded-xl bg-surface" data-group={group.id} defaultExpanded={group.defaultExpanded}>
      <Disclosure.Heading className="flex items-center gap-1 pr-2">
        <Disclosure.Trigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2.5 pr-1 pl-3.5 text-left hover:bg-default/50">
          {header}
          <Disclosure.Indicator className="ml-auto size-4 text-muted" />
        </Disclosure.Trigger>
        {group.allLinks.length > 0 ? (
          <IconActionButton
            ariaLabel="Copy all links"
            icon={copyIcon}
            tooltip="Copy all links"
            variant="ghost"
            onPress={() => onCopy(group.allLinks.join('\n'), RUN_HISTORY_COPY_CONFIRMATIONS.allLinks)}
          />
        ) : null}
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="p-0">
          {group.isUnrecorded ? (
            <div className="px-2 pb-2">
              <AirisEmptyState description={RUN_HISTORY_UNRECORDED_COPY.description} kind="caught-up" size="row" title={RUN_HISTORY_UNRECORDED_COPY.title} />
            </div>
          ) : (
            <ul className="flex flex-col px-2 pb-2">
              {group.rows.map((row) => (
                <RunHistoryAnimeRow
                  cover={row.animeId === undefined ? undefined : covers.get(row.animeId)}
                  key={row.key}
                  row={row}
                  onCopy={onCopy}
                  onEditAnime={onEditAnime}
                  onOpenLink={onOpenLink}
                />
              ))}
            </ul>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
