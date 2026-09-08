/** Tabs the editor route can open on. */
export type AnimeEditorTab = 'library' | 'create';

/** Route-supplied inputs for the Library/Create tab shell. */
export interface AnimeEditorRouteProps {
  /**
   * Which tab the route opens on. Optional so `/editor` and `/editor/:id` keep
   * their Library default.
   */
  readonly initialTab?: AnimeEditorTab;
}
