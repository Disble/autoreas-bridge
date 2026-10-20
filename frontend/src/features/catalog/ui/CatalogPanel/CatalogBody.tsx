import { Alert } from '@heroui/react';
import catalogAirisArtwork from '../../../../assets/airis-empty-states/catalog.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CLEAR_CRITERIA_LABEL, AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { CatalogResults } from './CatalogResults';
import { CatalogSkeleton } from './CatalogSkeleton';
import { CATALOG_PANEL_EMPTY_STATE_COPY, CATALOG_PANEL_ERROR_TITLE, CATALOG_PANEL_LOADING_LABEL } from './catalog-panel.constants';
import type { CatalogSectionProps } from './catalog-panel.types';

/** The exclusive content of the results pane: loading, failure, one empty state, or the results. */
export function CatalogBody({ state }: Readonly<CatalogSectionProps>) {
  const { emptyState, error, isLoading } = state;

  return (
    <>
      {isLoading ? (
        <div aria-labelledby="catalog-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="catalog-loading-label">{CATALOG_PANEL_LOADING_LABEL}</span>
          <CatalogSkeleton view={state.view} />
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

      {emptyState === 'actual' ? (
        <AirisEmptyState
          action={{ label: AIRIS_CREATE_ANIME_LABEL, onPress: state.onCreate }}
          description={CATALOG_PANEL_EMPTY_STATE_COPY.actual.description}
          imageSrc={catalogAirisArtwork}
          title={CATALOG_PANEL_EMPTY_STATE_COPY.actual.title}
        />
      ) : null}
      {emptyState === 'criteria' ? (
        <AirisEmptyState
          action={{ label: AIRIS_CLEAR_CRITERIA_LABEL, onPress: state.onClearCriteria }}
          description={CATALOG_PANEL_EMPTY_STATE_COPY.criteria.description}
          kind="filtered"
          title={CATALOG_PANEL_EMPTY_STATE_COPY.criteria.title}
        />
      ) : null}

      {!isLoading && error === undefined && state.items.length > 0 ? <CatalogResults state={state} /> : null}
    </>
  );
}
