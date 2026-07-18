import closeIcon from '@iconify-icons/solar/close-circle-broken';
import folderIcon from '@iconify-icons/solar/folder-with-files-broken';
import linkIcon from '@iconify-icons/solar/link-round-broken';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import { getAvailabilityIndicator } from './intake-panel.helpers';
import type { IntakeRowActionsProps } from './intake-panel.types';

/**
 * The trailing action cluster for an intake row: open-page link, per-row
 * download-folder picker, discard, and the availability dot. Each control is
 * gated independently (matched slug, creatable, read-only), so this stays a
 * pure presentational fan-out of the row's current state.
 */
export function IntakeRowActions({
  row,
  readOnly,
  creatable,
  folderOverride,
  folderPreview,
  onPickFolder,
  onDiscard,
  onOpenPage,
}: Readonly<IntakeRowActionsProps>) {
  const indicator = getAvailabilityIndicator(row);

  return (
    <div className="ml-auto flex items-center gap-2">
      {row.matchedSlug !== '' && (
        <Tooltip>
          <Button
            isIconOnly
            aria-label={`Open the page for ${row.rawName}`}
            className="hover:text-accent"
            size="sm"
            variant="tertiary"
            onPress={() => onOpenPage(row.matchedSlug)}
          >
            <Icon className="size-4" icon={linkIcon} />
          </Button>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            Open page
          </Tooltip.Content>
        </Tooltip>
      )}
      {creatable && !readOnly && (
        <Tooltip>
          <span title={folderPreview ?? 'Default download folder'}>
            <Button
              isIconOnly
              aria-label={`Set download folder for ${row.rawName}`}
              className={folderOverride === undefined ? 'hover:text-success' : 'text-success'}
              size="sm"
              variant="tertiary"
              onPress={onPickFolder}
            >
              <Icon className="size-4" icon={folderIcon} />
            </Button>
          </span>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            {folderPreview ?? 'Default download folder'}
          </Tooltip.Content>
        </Tooltip>
      )}
      {!readOnly && (
        <Tooltip>
          <Button
            isIconOnly
            aria-label={`Discard ${row.rawName}`}
            className="hover:text-danger"
            size="sm"
            variant="tertiary"
            onPress={onDiscard}
          >
            <Icon className="size-4" icon={closeIcon} />
          </Button>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            Discard
          </Tooltip.Content>
        </Tooltip>
      )}
      {indicator !== null && (
        <Tooltip>
          <span
            aria-label={indicator.label}
            className={`size-2.5 shrink-0 rounded-full ${indicator.color === 'success' ? 'bg-success' : 'bg-danger'}`}
          />
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            {indicator.label}
          </Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}
