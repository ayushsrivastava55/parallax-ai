import type {
  Provider,
  ProviderResult,
  IAgentRuntime,
  Memory,
  State,
} from '../../lib/types.js';
import { logger } from '../../lib/types.js';

export const portfolioProvider: Provider = {
  name: 'PORTFOLIO_PROVIDER',
  description: 'Provides current portfolio state and wallet balance context.',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const wallet = String(runtime.getSetting('BNB_PUBLIC_KEY') || process.env.BNB_PUBLIC_KEY || '');

    if (!wallet) {
      return {
        text: '[Portfolio] No wallet configured. Set BNB_PRIVATE_KEY to enable trading.',
        values: {},
        data: {},
      };
    }

    return {
      text: `[Portfolio] Wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}. Platform: BNB Chain testnet. Ready to trade on Predict.fun (testnet) and Opinion.`,
      values: { wallet },
      data: {},
    };
  },
};
