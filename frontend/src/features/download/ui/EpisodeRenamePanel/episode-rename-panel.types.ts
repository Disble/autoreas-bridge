/** Props for the `EpisodeRenamePanel` dumb-UI component. */
export interface EpisodeRenamePanelProps {
  readonly className?: string;
}

/** Loading/ready/error states for the episode-rename toggle. */
export type EpisodeRenamePanelStatus = 'loading' | 'ready' | 'error';

/** Internal state owned by `useEpisodeRenamePanel`. */
export interface EpisodeRenamePanelState {
  readonly enabled: boolean;
  readonly hasLoaded: boolean;
  readonly isSaving: boolean;
  readonly errorMessage?: string;
}
