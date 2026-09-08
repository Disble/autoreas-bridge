import { Alert, Card } from '@heroui/react';
import { useNavigate } from 'react-router';
import catalogAirisArtwork from '../../../../assets/airis-empty-states/catalog.webp';
import { ANIME_CREATE_ROUTE } from '../../../../shared/navigation/app-layout.constants';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CLEAR_CRITERIA_LABEL, AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { CatalogFilterBar } from '../CatalogFilterBar/CatalogFilterBar';
import { CatalogListRow } from './CatalogListRow';
import { CatalogListSkeleton } from './CatalogListSkeleton';
import type { CatalogPanelProps } from './catalog-panel.types';
import {
  CATALOG_PANEL_EMPTY_STATE_COPY,
  CATALOG_PANEL_ERROR_TITLE,
  CATALOG_PANEL_LOADING_LABEL,
} from './catalog-panel.constants';
import { useCatalogPanel } from './use-catalog-panel';

/** Panel showing the full local anime catalog with active/inactive status. */
export function CatalogPanel(props: Readonly<CatalogPanelProps>) {
  const navigate = useNavigate();
  const {
    emptyState,
    error,
    isLoading,
    items,
    listWindow,
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
    onClearCriteria,
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
          <div aria-labelledby="catalog-panel-loading-label" aria-live="polite" className="flex flex-col gap-3" role="status">
            <span className="sr-only" id="catalog-panel-loading-label">{CATALOG_PANEL_LOADING_LABEL}</span>
            <CatalogListSkeleton />
          </div>
        ) : null}

        {error === undefined ? null : (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>{CATALOG_PANEL_ERROR_TITLE}</Alert.Title>
              <Alert.Description>{error.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {emptyState === 'none' ? null : (
          <AirisEmptyState
            action={emptyState === 'actual'
              ? { label: AIRIS_CREATE_ANIME_LABEL, onPress: () => void navigate(ANIME_CREATE_ROUTE) }
              : { label: AIRIS_CLEAR_CRITERIA_LABEL, onPress: onClearCriteria }}
            description={CATALOG_PANEL_EMPTY_STATE_COPY[emptyState].description}
            imageSrc={catalogAirisArtwork}
            title={CATALOG_PANEL_EMPTY_STATE_COPY[emptyState].title}
          />
        )}

        {!isLoading && emptyState === 'none' && error === undefined ? (
          <menu
            aria-label="Anime catalog"
            className="flex max-h-[28rem] min-h-0 flex-col gap-3 overflow-y-auto pr-1"
            data-testid="catalog-list-scroll"
            onScroll={listWindow.onScroll}
            ref={listWindow.scrollRef}
          >
            {items.map((item) => (
              <CatalogListRow item={item} key={item.id} />
            ))}
          </menu>
        ) : null}
      </Card.Content>
    </Card>
  );
}
