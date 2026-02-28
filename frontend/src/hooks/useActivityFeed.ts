import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { activityFeed } from '../lib/api.ts';
import type { ActivityEvent } from '../lib/constants.ts';

export function useActivityFeed(limit = 30) {
  const fetcher = useCallback(() => activityFeed(limit).then((d) => d.activity), [limit]);
  return usePolling<ActivityEvent[]>(fetcher, 10_000);
}
