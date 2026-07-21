import { Card, Chip, Spinner } from '@heroui/react';
import type { SyncingAnimePanelProps } from './syncing-anime-panel.types';
import {
  SYNCING_ANIME_PANEL_DESCRIPTION,
  SYNCING_ANIME_PANEL_EMPTY_DESCRIPTION,
  SYNCING_ANIME_PANEL_EMPTY_TITLE,
  SYNCING_ANIME_PANEL_LOADING_LABEL,
  SYNCING_ANIME_PANEL_TITLE,
} from './syncing-anime-panel.constants';
import { useSyncingAnimePanel } from './use-syncing-anime-panel';

/** Panel showing the anime items that still have pending bridge sync work. */
export function SyncingAnimePanel(props: Readonly<SyncingAnimePanelProps>) {
  const { isEmpty, isLoading, items } = useSyncingAnimePanel(props);

  return (
    <Card>
      <Card.Header>
        <Card.Title>{SYNCING_ANIME_PANEL_TITLE}</Card.Title>
        <Card.Description>{SYNCING_ANIME_PANEL_DESCRIPTION}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-muted">
            <Spinner size="sm" />
            <span>{SYNCING_ANIME_PANEL_LOADING_LABEL}</span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{SYNCING_ANIME_PANEL_EMPTY_TITLE}</p>
            <p className="mt-2 text-sm text-muted">{SYNCING_ANIME_PANEL_EMPTY_DESCRIPTION}</p>
          </div>
        ) : null}

        {!isLoading && !isEmpty ? (
          <div className="grid max-h-[28rem] grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
            {items.map((item) => (
              <article key={item.animeId} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.04]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-xs text-muted">{item.progressLabel ?? 'Progress unavailable'}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Chip color={item.changeTone} size="sm" variant="soft">
                      <Chip.Label>{item.changeLabel}</Chip.Label>
                    </Chip>
                    <Chip color="default" size="sm" variant="secondary">
                      <Chip.Label>{item.queueLabel}</Chip.Label>
                    </Chip>
                  </div>
                </div>

                {item.changedFields.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.changedFields.map((field) => (
                      <Chip key={`${item.animeId}-${field}`} color="default" size="sm" variant="tertiary">
                        {field}
                      </Chip>
                    ))}
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-default-500">Last update {item.lastUpdatedLabel}</p>
              </article>
            ))}
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
