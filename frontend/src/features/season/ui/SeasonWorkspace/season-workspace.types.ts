/** Derived view model for the Overview section of a season. */
export interface SeasonOverview {
  readonly title: string;
  readonly statusLabel: string;
  readonly statusColor: 'success' | 'default';
  readonly createdLabel: string;
  readonly minApprovalGrade: number;
  readonly slots: number;
}

/** One row in the past-seasons history list (shown when no season is open). */
export interface PastSeasonEntry {
  readonly id: string;
  readonly name: string;
  readonly statusLabel: string;
  readonly statusColor: 'success' | 'default';
  readonly createdLabel: string;
}

/** Props for the SeasonWorkspace panel; all data flows through its hook. */
export interface SeasonWorkspaceProps {
  readonly className?: string;
}
