import { Alert } from '@heroui/react';
import { SEASON_MODE_BANNER_DESCRIPTION, SEASON_MODE_BANNER_TITLE } from './schedule-panel.constants';
import type { ScheduleSeasonModeBannerProps } from './schedule-panel.types';

/** Renders the informational banner while season mode overrides the weekday schedule, or nothing otherwise. */
export function ScheduleSeasonModeBanner({ isActive }: Readonly<ScheduleSeasonModeBannerProps>) {
  if (!isActive) {
    return null;
  }

  return (
    <Alert status="default">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{SEASON_MODE_BANNER_TITLE}</Alert.Title>
        <Alert.Description>{SEASON_MODE_BANNER_DESCRIPTION}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
