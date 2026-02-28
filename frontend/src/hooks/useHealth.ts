import { useCallback } from 'react';
import { usePolling } from './usePolling.ts';
import { systemHealth, connectorStatus } from '../lib/api.ts';

export function useHealth() {
  const healthFetcher = useCallback(() => systemHealth(), []);
  const connectorFetcher = useCallback(() => connectorStatus(), []);
  const health = usePolling(healthFetcher, 30_000);
  const connectors = usePolling(connectorFetcher, 30_000);
  return { health, connectors };
}
