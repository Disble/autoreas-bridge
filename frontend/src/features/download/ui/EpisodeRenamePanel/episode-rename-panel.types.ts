/** Props for the `EpisodeRenamePanel` dumb-UI component. */
export interface EpisodeRenamePanelProps {
  readonly className?: string;
}

/** Loading/ready/error states for the episode-rename toggle. */
export type EpisodeRenamePanelStatus = 'loading' | 'ready' | 'error';
