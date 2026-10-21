/** Props for the approved Airis "No Cover" poster that fills a cover frame. */
export interface NoCoverPosterProps {
  /** Accessible name of the poster and the text of its pill; UI copy, never baked into the art. */
  readonly label: string;
  /** Draws the label as a pill over the poster; thumbnails are too small for it. */
  readonly showLabel: boolean;
  /** Placement and visibility classes for the pill (e.g. a container-query `hidden`). */
  readonly labelClassName?: string;
}
