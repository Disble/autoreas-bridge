import defaultFolderIcon from '@iconify-icons/solar/folder-open-bold-duotone';
import defaultLinkIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { DesktopActionButton } from './DesktopActionButton';
import type { AnimeDesktopActionsProps } from './AnimeDesktopActions.types';

/**
 * Shared desktop-actions pair (open/copy page + open/copy folder) rendered by
 * both the Episodes card and the Selection board. Each button hides when its
 * `has*` flag is false, so the same component works whether the anime has a
 * source page, a download folder, both, or neither.
 */
export function AnimeDesktopActions(props: Readonly<AnimeDesktopActionsProps>) {
  const { animeId, name, hasPage, hasFolder, pageUrl, folderPath, onOpenPage, onCopyPage, onOpenFolder, onCopyFolder, pageIcon, folderIcon } = props;

  return (
    <>
      {hasPage && (
        <DesktopActionButton
          ariaLabel={`Open page for ${name}. Secondary click copies page URL.`}
          className="hover:text-accent"
          icon={pageIcon ?? defaultLinkIcon}
          path={pageUrl}
          onOpen={() => onOpenPage(animeId)}
          onCopy={() => onCopyPage(animeId)}
        />
      )}
      {hasFolder && (
        <DesktopActionButton
          ariaLabel={`Open folder for ${name}. Secondary click copies folder path.`}
          className="hover:text-success"
          icon={folderIcon ?? defaultFolderIcon}
          path={folderPath}
          onOpen={() => onOpenFolder(animeId)}
          onCopy={() => onCopyFolder(animeId)}
        />
      )}
    </>
  );
}
