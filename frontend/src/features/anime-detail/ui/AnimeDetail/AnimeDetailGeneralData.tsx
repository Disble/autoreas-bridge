import copyIcon from '@iconify-icons/solar/copy-linear';
import { Chip, Link } from '@heroui/react';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { AnimeDetailField } from './AnimeDetailField';
import {
  ANIME_DETAIL_COPY_FOLDER_LABEL,
  ANIME_DETAIL_COPY_FOLDER_TOOLTIP,
  ANIME_DETAIL_FIELD_GRID_CLASS,
  ANIME_DETAIL_GENERAL_DATA_CLASS,
  ANIME_DETAIL_GENERAL_DATA_TITLE_ID,
  ANIME_DETAIL_NO_GENEROS_MESSAGE,
  ANIME_DETAIL_UNKNOWN_LABEL,
} from './anime-detail.constants';
import type { AnimeDetailGeneralDataProps } from './anime-detail.types';

/**
 * General data as an inner surface: Folder (with its copy action) and Page
 * span the grid, then Studios, Origin, the three dates and Genres. The Page
 * link has no `href`: it opens through the bridge in the default browser,
 * because a WebView `href` would open an internal window.
 */
export function AnimeDetailGeneralData({ detail, onCopyFolder, onOpenPage }: Readonly<AnimeDetailGeneralDataProps>) {
  return (
    <section aria-labelledby={ANIME_DETAIL_GENERAL_DATA_TITLE_ID} className={ANIME_DETAIL_GENERAL_DATA_CLASS}>
      <h2 className="mb-3 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase" id={ANIME_DETAIL_GENERAL_DATA_TITLE_ID}>General data</h2>
      <dl className={ANIME_DETAIL_FIELD_GRID_CLASS}>
        <AnimeDetailField isWide label="Folder">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-auto break-all">{detail.carpetaLabel}</span>
            {detail.hasFolder ? (
              <IconActionButton ariaLabel={ANIME_DETAIL_COPY_FOLDER_LABEL} icon={copyIcon} tooltip={ANIME_DETAIL_COPY_FOLDER_TOOLTIP} variant="ghost" onPress={() => void onCopyFolder()} />
            ) : null}
          </span>
        </AnimeDetailField>
        <AnimeDetailField isWide label="Page">
          {detail.paginaUrl === undefined ? ANIME_DETAIL_UNKNOWN_LABEL : (
            <Link className="break-all text-accent underline underline-offset-2" onPress={() => void onOpenPage()}>{detail.paginaUrl}</Link>
          )}
        </AnimeDetailField>
        <AnimeDetailField label="Studios">{detail.studios}</AnimeDetailField>
        <AnimeDetailField label="Origin">{detail.origin}</AnimeDetailField>
        <AnimeDetailField label="First watched">{detail.estrenoLabel}</AnimeDetailField>
        <AnimeDetailField label="Last episode watched">{detail.ultCapVistoLabel}</AnimeDetailField>
        <AnimeDetailField label="Creation date">{detail.creacionLabel}</AnimeDetailField>
        <AnimeDetailField label="Genres">
          {detail.hasGenres ? (
            <span className="flex flex-wrap gap-2 pt-0.5">
              {detail.genres.map((genre) => (
                <Chip color="default" key={genre} size="sm" variant="soft">
                  <Chip.Label>{genre}</Chip.Label>
                </Chip>
              ))}
            </span>
          ) : <span className="text-muted">{ANIME_DETAIL_NO_GENEROS_MESSAGE}</span>}
        </AnimeDetailField>
      </dl>
    </section>
  );
}
