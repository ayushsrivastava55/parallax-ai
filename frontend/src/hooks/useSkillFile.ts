import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { fetchSkillFile } from '../lib/api.ts';

export function useSkillFile(filename: string) {
  const fetcher = useCallback(() => fetchSkillFile(filename), [filename]);
  return usePolling<string>(fetcher, 0);
}
