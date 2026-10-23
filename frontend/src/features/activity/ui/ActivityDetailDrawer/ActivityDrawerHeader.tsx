import { Icon } from '@iconify/react';
import arrowLeftIcon from '@iconify-icons/solar/arrow-left-bold';
import closeIcon from '@iconify-icons/solar/close-circle-bold';
import codeIcon from '@iconify-icons/solar/code-bold';
import copyIcon from '@iconify-icons/solar/copy-bold';
import serverIcon from '@iconify-icons/solar/server-bold';
import phoneIcon from '@iconify-icons/solar/smartphone-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_DRAWER_TILE_CLASS } from './activity-detail-drawer.constants';
import type { ActivityDrawerHeaderProps } from './activity-detail-drawer.types';

/**
 * The header every kind shares: origin icon (red tile when failed, amber when
 * slow), title, the row's phrase (red when failed) and the full time, then the
 * icon-only actions: technical details or back, Copy for AI, Close.
 */
export function ActivityDrawerHeader({ header, technical, onToggleTechnical, onCopy, onClose }: ActivityDrawerHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <span
        aria-label={header.originLabel}
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${ACTIVITY_DRAWER_TILE_CLASS[header.tone]}`}
        data-testid="activity-drawer-origin"
        role="img"
      >
        <Icon icon={header.origin === 'phone' ? phoneIcon : serverIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold text-foreground" id="activity-drawer-title">
          {header.title}
        </h2>
        {header.phrase !== '' && <p className={`text-sm ${header.failed ? 'text-danger' : 'text-muted'}`}>{header.phrase}</p>}
        <p className="text-xs text-muted">{header.when}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconActionButton
          ariaLabel={technical ? 'Back to summary' : 'Technical details'}
          icon={technical ? arrowLeftIcon : codeIcon}
          onPress={onToggleTechnical}
          tooltip={technical ? 'Back to summary' : 'Technical details'}
        />
        <IconActionButton ariaLabel="Copy for AI" icon={copyIcon} onPress={onCopy} tooltip="Copy for AI" />
        <IconActionButton ariaLabel="Close" icon={closeIcon} onPress={onClose} tooltip="Close" />
      </div>
    </header>
  );
}
