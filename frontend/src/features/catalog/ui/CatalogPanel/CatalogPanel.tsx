import plusIcon from '@iconify-icons/tabler/plus';
import { Icon } from '@iconify/react';
import { Button } from '@heroui/react';
import { AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { PageHeader } from '../../../../shared/ui/PageHeader/PageHeader';
import { CatalogBody } from './CatalogBody';
import { CatalogResultLine } from './CatalogResultLine';
import { CatalogToolbar } from './CatalogToolbar';
import { useCatalogPanel } from './use-catalog-panel';

/**
 * The Catalog screen: a header with Create, the search/filter/sort/view
 * toolbar, the result line, and the anime as cover cards or compact rows.
 * Like every other screen it fills the app layout's container and scrolls with
 * the page; the progressive window grows as the page nears its bottom.
 */
export function CatalogPanel() {
  const state = useCatalogPanel();
  const { error, isLoading } = state;

  return (
    <section aria-labelledby="catalog-title" className="flex w-full flex-col gap-4">
      <PageHeader
        actions={
          state.hasCatalog ? (
            <Button aria-label={AIRIS_CREATE_ANIME_LABEL} variant="primary" onPress={state.onCreate}>
              <Icon aria-hidden="true" className="size-4" icon={plusIcon} />
              Create
            </Button>
          ) : undefined
        }
        title="Catalog"
        titleId="catalog-title"
      />

      {state.hasCatalog ? (
        <>
          <CatalogToolbar state={state} />
          {isLoading || error !== undefined ? null : <CatalogResultLine state={state} />}
        </>
      ) : null}

      <CatalogBody state={state} />
    </section>
  );
}
