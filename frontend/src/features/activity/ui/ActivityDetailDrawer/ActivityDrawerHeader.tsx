import { Icon } from '@iconify/react';
import arrowLeftIcon from '@iconify-icons/solar/arrow-left-linear';
import closeIcon from '@iconify-icons/tabler/x';
import codeIcon from '@iconify-icons/solar/code-linear';
import copyIcon from '@iconify-icons/solar/copy-linear';
import monitorIcon from '@iconify-icons/solar/monitor-linear';
import phoneIcon from '@iconify-icons/solar/smartphone-linear';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_DRAWER_ACTIONS_CLASS, ACTIVITY_DRAWER_FAILED_TEXT_CLASS, ACTIVITY_DRAWER_TILE_CLASS } from './activity-detail-drawer.constants';
import type { ActivityDrawerHeaderProps } from './activity-detail-drawer.types';

/**
 * The header every kind shares: origin icon (red tile when failed, amber when
 * slow), title, the row's phrase (red when failed) and the full time, then the
 * icon-only actions: technical details or back, Copy for AI, Close.
 */
export function ActivityDrawerHeader({ header, technical, onToggleTechnical, onCopy, onClose }: ActivityDrawerHeaderProps) {
  return (
    <header className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3">
      <span
        aria-label={header.originLabel}
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${ACTIVITY_DRAWER_TILE_CLASS[header.tone]}`}
        data-testid="activity-drawer-origin"
        role="img"
      >
        <Icon className="size-[18px]" icon={header.origin === 'phone' ? phoneIcon : monitorIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base leading-[1.3] font-medium break-words text-foreground" id="activity-drawer-title">
          {header.title}
        </h2>
        {header.phrase !== '' && <p className={`mt-0.5 text-sm ${header.failed ? ACTIVITY_DRAWER_FAILED_TEXT_CLASS : 'text-muted'}`}>{header.phrase}</p>}
        <p className="mt-1.5 text-xs text-muted tabular-nums">{header.when}</p>
      </div>
      <div className={ACTIVITY_DRAWER_ACTIONS_CLASS}>
        <IconActionButton
          ariaLabel={technical ? 'Back to summary' : 'Technical details'}
          icon={technical ? arrowLeftIcon : codeIcon}
          onPress={onToggleTechnical}
          tooltip={technical ? 'Back to summary' : 'Technical details'}
          variant="ghost"
        />
        <IconActionButton ariaLabel="Copy for AI" icon={copyIcon} onPress={onCopy} tooltip="Copy for AI" variant="ghost" />
        <IconActionButton ariaLabel="Close" icon={closeIcon} onPress={onClose} tooltip="Close" variant="ghost" />
      </div>
    </header>
  );
}
