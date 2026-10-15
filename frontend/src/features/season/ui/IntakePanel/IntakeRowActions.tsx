import linkIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import { AnimeMetadataLookupModal } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/AnimeMetadataLookupModal';
import { canFindOnProvider } from './IntakeProviderLookup/intake-provider-lookup.helpers';
import { IntakeProviderLookup } from './IntakeProviderLookup/IntakeProviderLookup';
import { IntakeRowAvailabilityDot } from './IntakeRowAvailabilityDot';
import { IntakeRowFolderButton } from './IntakeRowFolderButton';
import { IntakeRowMoreMenu } from './IntakeRowMoreMenu';
import type { IntakeRowActionsProps } from './intake-panel.types';

/**
 * The trailing action group for an intake row, all round icon buttons in a fixed
 * order: the row's own MyAnimeList lookup, "Find on provider" while the match is
 * blocked, open page, the per-row download-folder picker, and the "More actions"
 * menu, followed by the availability dot. Each control is gated independently
 * (match status, matched slug, creatable, read-only) and is
 * always visible while it applies, so this stays a pure presentational fan-out
 * of the row's current state.
 */
export function IntakeRowActions(props: Readonly<IntakeRowActionsProps>) {
  const { row, readOnly } = props;

  return (
    <div className="ml-auto flex items-center gap-2">
      {/* The lookup lives on the row itself: no other row's name can reach it,
          and only a confirmed candidate is fetched. */}
      {!readOnly && (
        <AnimeMetadataLookupModal
          name={row.rawName}
          source={props.metadataLookupSource}
          triggerVariant="icon"
          onConfirm={props.onMetadataApplied}
        />
      )}
      {!readOnly && canFindOnProvider(row.matchStatus) && (
        <IntakeProviderLookup rawName={row.rawName} source={props.providerSearchSource} onResolve={props.onResolve} />
      )}
      {row.matchedSlug !== '' && (
        <Tooltip>
          <Button
            isIconOnly
            aria-label={`Open the page for ${row.rawName}`}
            className="hover:text-accent"
            size="sm"
            variant="tertiary"
            onPress={() => props.onOpenPage(row.matchedSlug)}
          >
            <Icon className="size-4" icon={linkIcon} />
          </Button>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            Open page
          </Tooltip.Content>
        </Tooltip>
      )}
      {props.creatable && !readOnly && (
        <IntakeRowFolderButton
          folderOverride={props.folderOverride}
          folderPreview={props.folderPreview}
          rawName={row.rawName}
          onPickFolder={props.onPickFolder}
        />
      )}
      {!readOnly && (
        <IntakeRowMoreMenu
          appliedMetadata={props.appliedMetadata}
          rawName={row.rawName}
          onDiscard={props.onDiscard}
          onMetadataClear={props.onMetadataClear}
          onMetadataUndo={props.onMetadataUndo}
        />
      )}
      <IntakeRowAvailabilityDot row={row} />
    </div>
  );
}
