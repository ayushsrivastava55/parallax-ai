import { logger } from '@elizaos/core';

export function auditGatewayEvent(event: string, details: Record<string, unknown>): void {
  logger.info({ event, ...details }, '[FLASH_GATEWAY]');
}
