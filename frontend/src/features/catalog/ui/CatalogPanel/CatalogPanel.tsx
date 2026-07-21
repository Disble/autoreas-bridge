import { Card, Chip, Spinner } from '@heroui/react';
import { Link } from 'react-router';
import { CatalogFilterBar } from '../CatalogFilterBar/CatalogFilterBar';
import type { CatalogPanelProps } from './catalog-panel.types';
import {
  CATALOG_PANEL_EMPTY_MESSAGE,
  CATALOG_PANEL_EMPTY_TITLE,
} from './catalog-panel.constants';
import { useCatalogPanel } from './use-catalog-panel';

/** Panel showing the full local anime catalog with active/inactive status. */
export function CatalogPanel(props: Readonly<CatalogPanelProps>) {
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
  } = useCatalogPanel(props);

  return (
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-4">
        <CatalogFilterBar
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
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-muted">
            <Spinner size="sm" />
            <span>Loading animes...</span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{CATALOG_PANEL_EMPTY_TITLE}</p>
            <p className="mt-2 text-sm text-muted">{CATALOG_PANEL_EMPTY_MESSAGE}</p>
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
                  <Link className="min-w-0 flex-1" to={`/catalog/detail/${item.id}`}>
                    <h3 className="truncate text-sm font-semibold text-foreground">{item.nombre}</h3>
                    <p className="mt-1 text-xs text-muted">{item.progressLabel}</p>
                  </Link>
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
