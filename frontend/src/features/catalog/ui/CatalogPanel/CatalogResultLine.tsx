import { Button, Tag, TagGroup, Typography } from '@heroui/react';
import { AIRIS_CLEAR_CRITERIA_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { CATALOG_ACTIVE_FILTERS_LABEL } from './catalog-panel.constants';
import type { CatalogSectionProps } from './catalog-panel.types';

/** "Showing n of N", one removable chip per active filter, and the clear-all action. */
export function CatalogResultLine({ state }: Readonly<CatalogSectionProps>) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2">
      <Typography aria-live="polite" className="mr-2" color="muted" type="body-sm">
        {state.matchingCount === state.totalCount ? (
          <>Showing all <strong className="font-semibold text-foreground tabular-nums">{state.totalCount}</strong></>
        ) : (
          <>Showing <strong className="font-semibold text-foreground tabular-nums">{state.matchingCount}</strong> of {state.totalCount}</>
        )}
      </Typography>
      {state.criterionChips.length > 0 ? (
        <TagGroup aria-label={CATALOG_ACTIVE_FILTERS_LABEL} size="sm" onRemove={state.onCriterionChipsRemove}>
          <TagGroup.List className="flex flex-wrap gap-2">
            {state.criterionChips.map((chip) => (
              <Tag id={chip.id} key={chip.id} textValue={`${chip.groupLabel}: ${chip.valueLabel}`}>
                <span className="text-muted">{chip.groupLabel}:</span> {chip.valueLabel}
              </Tag>
            ))}
          </TagGroup.List>
        </TagGroup>
      ) : null}
      {state.hasCriteria ? (
        <Button size="sm" variant="tertiary" onPress={state.onClearCriteria}>{AIRIS_CLEAR_CRITERIA_LABEL}</Button>
      ) : null}
    </div>
  );
}
