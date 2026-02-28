import { logger } from '../../lib/types.js';

export function auditGatewayEvent(event: string, details: Record<string, unknown>): void {
  logger.info({ event, ...details }, '[EYEBALZ_GATEWAY]');
}
