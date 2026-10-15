import magniferIcon from '@iconify-icons/solar/magnifer-bold-duotone';
import { LookupCandidateRow } from '../../../../../shared/ui/LookupModal/LookupCandidateRow';
import { LookupModal } from '../../../../../shared/ui/LookupModal/LookupModal';
import { LookupTrigger } from '../../../../../shared/ui/LookupModal/LookupTrigger';
import { PROVIDER_LOOKUP_COPY, PROVIDER_LOOKUP_TRIGGER_LABEL } from './intake-provider-lookup.constants';
import type { IntakeProviderLookupProps } from './intake-provider-lookup.types';
import { useIntakeProviderLookup } from './use-intake-provider-lookup';

/**
 * The "Find on provider" action of a blocked intake row: a round icon trigger
 * opening the shared lookup modal over every download provider's pages. A
 * picked page only highlights; "Use this page" resolves the row to it and
 * Cancel closes without writing. Provider results are a single search page, so
 * the list renders whole rather than through a progressive window.
 */
export function IntakeProviderLookup({ rawName, source, onResolve }: Readonly<IntakeProviderLookupProps>) {
  const lookup = useIntakeProviderLookup(rawName, source, onResolve);

  return (
    <LookupModal
      confirmError=""
      copy={PROVIDER_LOOKUP_COPY}
      errorMessage={lookup.errorMessage}
      hasCandidates={lookup.hasPages}
      isConfirmDisabled={lookup.isConfirmDisabled}
      isConfirming={false}
      isOpen={lookup.isOpen}
      query={lookup.query}
      state={lookup.state}
      trigger={<LookupTrigger icon={magniferIcon} isDisabled={false} label={PROVIDER_LOOKUP_TRIGGER_LABEL} variant="icon" />}
      onConfirm={lookup.onConfirm}
      onOpenChange={lookup.onOpenChange}
      onQueryChange={lookup.onQueryChange}
    >
      {lookup.pages.map((page) => (
        <LookupCandidateRow
          key={page.pageUrl}
          image={page.image}
          isSelected={page.isSelected}
          subtitle={page.subtitle}
          title={page.title}
          onPress={() => lookup.onSelectPage(page.pageUrl)}
        />
      ))}
    </LookupModal>
  );
}
