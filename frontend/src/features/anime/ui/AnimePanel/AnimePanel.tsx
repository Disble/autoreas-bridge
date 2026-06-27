import { Alert, Button, Card, Chip, Spinner } from '@heroui/react';
import { AnimeFilterBar } from '../AnimeFilterBar/AnimeFilterBar';
import type { AnimePanelProps } from './anime-panel.types';
import {
  ANIME_PANEL_EMPTY_MESSAGE,
  ANIME_PANEL_EMPTY_TITLE,
} from './anime-panel.constants';
import { getAnimeLegacyPullAlertStatus } from './anime-panel.helpers';
import { useAnimePanel } from './use-anime-panel';

/** Panel showing the full local anime catalog with active/inactive status. */
export function AnimePanel(props: Readonly<AnimePanelProps>) {
  const {
    isEmpty,
    isLoading,
    items,
    filters,
    estadoOptions,
    activoOptions,
    tipoOptions,
    diaOptions,
    generoOptions,
    gapOptions,
    onQueryChange,
    onEstadoChange,
    onActivoChange,
    onTipoChange,
    onDiaChange,
    onGenerosChange,
    onGapChange,
    onPullFromLegacy,
    isPullingFromLegacy,
    pullResult,
  } = useAnimePanel(props);

  return (
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-4">
        <AnimeFilterBar
          filters={filters}
          estadoOptions={estadoOptions}
          activoOptions={activoOptions}
          tipoOptions={tipoOptions}
          diaOptions={diaOptions}
          generoOptions={generoOptions}
          gapOptions={gapOptions}
          onQueryChange={onQueryChange}
          onEstadoChange={onEstadoChange}
          onActivoChange={onActivoChange}
          onTipoChange={onTipoChange}
          onDiaChange={onDiaChange}
          onGenerosChange={onGenerosChange}
          onGapChange={onGapChange}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            isDisabled={isLoading || isPullingFromLegacy}
            isPending={isPullingFromLegacy}
            onPress={onPullFromLegacy}
            variant="secondary"
          >
            {isPullingFromLegacy ? 'Pulling from legacy...' : 'Pull from legacy'}
          </Button>
          {pullResult ? (
            <Alert status={getAnimeLegacyPullAlertStatus(pullResult.status)}>
              <Alert.Content>
                <Alert.Description>{pullResult.message}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-muted">
            <Spinner size="sm" />
            <span>Loading animes...</span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{ANIME_PANEL_EMPTY_TITLE}</p>
            <p className="mt-2 text-sm text-muted">{ANIME_PANEL_EMPTY_MESSAGE}</p>
          </div>
        ) : null}

        {!isLoading && !isEmpty ? (
          <menu
            aria-label="Anime catalog"
            className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1"
          >
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-foreground">{item.nombre}</h3>
                    <p className="mt-1 text-xs text-muted">{item.progressLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.hasDownloadGap ? (
                      <Chip
                        color="warning"
                        data-testid={`anime-gap-${item.id}`}
                        size="sm"
                        variant="soft"
                      >
                        <Chip.Label>{item.gapLabel}</Chip.Label>
                      </Chip>
                    ) : null}
                    <Chip
                      color={item.status === 'active' ? 'success' : 'default'}
                      data-testid={`anime-status-${item.id}`}
                      size="sm"
                      variant="soft"
                    >
                      <Chip.Label>{item.statusLabel}</Chip.Label>
                    </Chip>
                  </div>
                </div>
              </li>
            ))}
          </menu>
        ) : null}
      </Card.Content>
    </Card>
  );
}
