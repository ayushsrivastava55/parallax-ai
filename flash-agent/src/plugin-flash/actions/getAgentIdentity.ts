import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { ERC8004Service, buildERC8004Config } from '../services/erc8004.ts';

export const getAgentIdentityAction: Action = {
  name: 'GET_AGENT_IDENTITY',
  similes: [
    'AGENT_IDENTITY',
    'AGENT_REPUTATION',
    'ON_CHAIN_IDENTITY',
    'ERC8004',
    'AGENT_STATS',
    'VALIDATION_STATUS',
  ],
  description:
    'Show the agent\'s on-chain ERC-8004 identity, reputation score, and validation status. Triggers on: "identity", "reputation", "on-chain", "agent stats", "erc-8004", "validation score".',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    return (
      text.includes('identity') ||
      text.includes('reputation') ||
      text.includes('on-chain') ||
      text.includes('on chain') ||
      text.includes('agent stats') ||
      text.includes('erc-8004') ||
      text.includes('erc8004') ||
      text.includes('validation')
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const config = buildERC8004Config(runtime);

      if (!config) {
        await callback({
          text: 'ERC-8004 identity is not configured. Set `ERC8004_ENABLED=true` and provide registry addresses in your .env to enable on-chain agent identity.',
          actions: ['GET_AGENT_IDENTITY'],
          source: message.content.source,
        });
        return { text: 'ERC-8004 not configured', success: false };
      }

      const service = new ERC8004Service(config);

      const [identity, reputation, validation, flashStats] = await Promise.all([
        service.getAgentIdentity().catch(() => null),
        service.getReputationSummary().catch(() => null),
        service.getValidationSummary().catch(() => null),
        service.getFlashAgentStats().catch(() => null),
      ]);

      let text = '**On-Chain Agent Identity (ERC-8004)**\n\n';

      if (identity) {
        text += `  Agent ID: ${identity.agentId}\n`;
        text += `  Owner: ${identity.owner}\n`;
        text += `  Wallet: ${identity.wallet}\n`;
        text += `  URI: ${identity.uri || 'not set'}\n\n`;
      }

      if (reputation) {
        text += `**Reputation**\n`;
        text += `  Total Feedback: ${reputation.totalFeedback}\n`;
        text += `  Average Score: ${reputation.averageScore}\n`;
        text += `  Unique Clients: ${reputation.clients.length}\n\n`;
      }

      if (validation) {
        text += `**Validation**\n`;
        text += `  Total Validations: ${validation.totalValidations}\n`;
        text += `  Average Response: ${validation.averageResponse}\n\n`;
      }

      if (flashStats) {
        text += `**Flash NFA Stats**\n`;
        text += `  Total Trades: ${flashStats.totalTrades}\n`;
        text += `  Successful: ${flashStats.successfulTrades}\n`;
        text += `  Success Rate: ${flashStats.successRate}%\n`;
        text += `  Total Volume: ${flashStats.totalVolume} BNB\n`;
        text += `  Active: ${flashStats.isActive ? 'Yes' : 'No'}\n`;
      }

      const chain = config.rpcUrl.includes('testnet') ? 'BSC Testnet' : 'BSC';
      text += `\n  Network: ${chain}`;
      text += `\n  Identity Registry: ${config.identityRegistryAddress}`;

      await callback({
        text,
        actions: ['GET_AGENT_IDENTITY'],
        source: message.content.source,
      });

      return {
        text: 'Agent identity retrieved',
        success: true,
        data: { identity, reputation, validation, flashStats },
      };
    } catch (error) {
      logger.error({ error }, 'Error in GET_AGENT_IDENTITY');
      await callback({
        text: `Failed to retrieve agent identity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: ['GET_AGENT_IDENTITY'],
        source: message.content.source,
      });
      return {
        text: 'Failed to get agent identity',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Show my agent identity' },
      },
      {
        name: 'Flash',
        content: {
          text: 'On-Chain Agent Identity (ERC-8004)\n  Agent ID: 0\n  Reputation Score: 100\n  Total Trades: 5',
          actions: ['GET_AGENT_IDENTITY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: "What's my on-chain reputation?" },
      },
      {
        name: 'Flash',
        content: {
          text: 'Reputation: 12 feedback entries, average score 85, 3 unique clients',
          actions: ['GET_AGENT_IDENTITY'],
        },
      },
    ],
  ],
};
