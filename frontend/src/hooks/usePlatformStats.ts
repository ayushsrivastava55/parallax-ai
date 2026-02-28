import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { platformStats } from '../lib/api.ts';

export function usePlatformStats() {
  const fetcher = useCallback(() => platformStats(), []);
  return usePolling(fetcher, 15_000);
}
