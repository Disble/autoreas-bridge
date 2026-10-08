import menuDotsIcon from '@iconify-icons/solar/menu-dots-bold';
import { Icon } from '@iconify/react';
import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import type { IntakeRowMoreMenuProps } from './intake-panel.types';

/**
 * IntakeRowMoreMenu is the round "⋯" button that ends an editable intake row's
 * action group. Its menu holds the row's less frequent actions: Undo autofill
 * while this session holds the pre-image, Clear metadata while the row holds
 * any, and Discard. Purely presentational: every action is a parent callback.
 */
export function IntakeRowMoreMenu({
  rawName,
  appliedMetadata,
  onMetadataUndo,
  onMetadataClear,
  onDiscard,
}: Readonly<IntakeRowMoreMenuProps>) {
  return (
    <Dropdown>
      <Tooltip>
        <Button isIconOnly aria-label={`More actions for ${rawName}`} size="sm" variant="tertiary">
          <Icon className="size-4" icon={menuDotsIcon} />
        </Button>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          More actions
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover>
        <Dropdown.Menu>
          {appliedMetadata?.canUndo === true ? (
            <Dropdown.Item id="undo" textValue="Undo autofill" onAction={onMetadataUndo}>
              <Label>Undo autofill</Label>
            </Dropdown.Item>
          ) : null}
          {appliedMetadata === undefined ? null : (
            <Dropdown.Item id="clear" textValue="Clear metadata" onAction={onMetadataClear}>
              <Label>Clear metadata</Label>
            </Dropdown.Item>
          )}
          <Dropdown.Item id="discard" textValue="Discard" variant="danger" onAction={onDiscard}>
            <Label>Discard</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
