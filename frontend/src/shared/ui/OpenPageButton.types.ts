/**
 * Props for the reusable "open page" icon button: a round tertiary icon button
 * that opens an anime's provider page in the external browser.
 */
export interface OpenPageButtonProps {
  /** The anime name the accessible label names. */
  readonly name: string;
  /** The provider page URL handed to `onOpen`. */
  readonly pageUrl: string;
  /** Called with `pageUrl` on press; the caller routes it to the external browser. */
  readonly onOpen: (pageUrl: string) => void;
}
