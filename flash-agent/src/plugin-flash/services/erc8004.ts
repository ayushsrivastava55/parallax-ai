import { ethers } from 'ethers';
import type { IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';
import type {
  ERC8004Config,
  AgentIdentity,
  ReputationSummary,
  ValidationSummary,
  FlashAgentStats,
} from '../types/index.ts';
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
  FLASH_AGENT_ABI,
} from './abis/erc8004Abis.ts';

/**
 * Build an ERC8004Config from runtime settings / env.
 * Returns null if feature flag is off or required addresses are missing.
 */
export function buildERC8004Config(runtime?: IAgentRuntime): ERC8004Config | null {
  const get = (key: string) =>
    String(runtime?.getSetting?.(key) || process.env[key] || '');

  const enabled = get('ERC8004_ENABLED');
  if (enabled !== 'true') return null;

  const identityRegistryAddress = get('ERC8004_IDENTITY_REGISTRY');
  const reputationRegistryAddress = get('ERC8004_REPUTATION_REGISTRY');
  const validationRegistryAddress = get('ERC8004_VALIDATION_REGISTRY');
  const flashAgentAddress = get('FLASH_AGENT_CONTRACT');
  const privateKey = get('BNB_PRIVATE_KEY');
  const rpcUrl = get('BSC_TESTNET_RPC') || 'https://data-seed-prebsc-1-s1.binance.org:8545';

  if (!identityRegistryAddress || !reputationRegistryAddress || !validationRegistryAddress) {
    return null;
  }

  if (!privateKey) {
    return null;
  }

  const agentIdStr = get('ERC8004_AGENT_ID');
  const agentId = agentIdStr ? parseInt(agentIdStr, 10) : undefined;

  return {
    rpcUrl,
    privateKey,
    identityRegistryAddress,
    reputationRegistryAddress,
    validationRegistryAddress,
    flashAgentAddress,
    agentId,
  };
}

/**
 * TypeScript service wrapping all ERC-8004 contract calls.
 * All write operations are fire-and-forget safe (caller wraps in try/catch).
 */
export class ERC8004Service {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private identityRegistry: ethers.Contract;
  private reputationRegistry: ethers.Contract;
  private validationRegistry: ethers.Contract;
  private flashAgent: ethers.Contract | null;
  private config: ERC8004Config;

  constructor(config: ERC8004Config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);

    this.identityRegistry = new ethers.Contract(
      config.identityRegistryAddress,
      IDENTITY_REGISTRY_ABI,
      this.wallet,
    );
    this.reputationRegistry = new ethers.Contract(
      config.reputationRegistryAddress,
      REPUTATION_REGISTRY_ABI,
      this.wallet,
    );
    this.validationRegistry = new ethers.Contract(
      config.validationRegistryAddress,
      VALIDATION_REGISTRY_ABI,
      this.wallet,
    );
    this.flashAgent = config.flashAgentAddress
      ? new ethers.Contract(config.flashAgentAddress, FLASH_AGENT_ABI, this.provider)
      : null;
  }

  // ═══ Identity ═══

  /**
   * Ensure the agent is registered. If agentId is set in config, just verify.
   * Otherwise register a new agent.
   */
  async ensureRegistered(): Promise<number> {
    if (this.config.agentId !== undefined) {
      // Verify agent exists by checking owner
      const owner = await this.identityRegistry.ownerOf(this.config.agentId);
      logger.info({ agentId: this.config.agentId, owner }, 'ERC-8004 agent identity confirmed');
      return this.config.agentId;
    }

    // Register new agent
    const tx = await this.identityRegistry['register(string)'](
      'https://flash-agent.example.com/erc8004-metadata.json',
    );
    const receipt = await tx.wait();

    let agentId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = this.identityRegistry.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === 'Registered') {
          agentId = Number(parsed.args.agentId);
          break;
        }
      } catch {
        // skip non-matching logs
      }
    }

    this.config.agentId = agentId;
    logger.info({ agentId }, 'ERC-8004 agent registered on-chain');
    return agentId;
  }

  async getAgentIdentity(): Promise<AgentIdentity> {
    const agentId = this.config.agentId ?? 0;
    const [owner, wallet, uri] = await Promise.all([
      this.identityRegistry.ownerOf(agentId).catch(() => '0x0'),
      this.identityRegistry.getAgentWallet(agentId).catch(() => ethers.ZeroAddress),
      this.identityRegistry.tokenURI(agentId).catch(() => ''),
    ]);

    return {
      agentId,
      owner,
      wallet: wallet === ethers.ZeroAddress ? this.wallet.address : wallet,
      uri,
      metadata: {},
    };
  }

  async setMetadata(key: string, value: string): Promise<ethers.TransactionReceipt> {
    const agentId = this.config.agentId ?? 0;
    const encoded = ethers.toUtf8Bytes(value);
    const tx = await this.identityRegistry.setMetadata(agentId, key, encoded);
    return tx.wait();
  }

  // ═══ Reputation ═══

  /**
   * Submit trade feedback. Maps trade result to on-chain reputation signal.
   */
  async submitTradeFeedback(params: {
    success: boolean;
    profitPercent: number;
    marketTitle: string;
    platform: string;
  }): Promise<ethers.TransactionReceipt> {
    const agentId = this.config.agentId ?? 0;
    // value: +100 for success, -100 for failure, scaled by profitPercent
    const value = params.success ? 100 + Math.round(params.profitPercent) : -50;
    const feedbackHash = ethers.keccak256(
      ethers.toUtf8Bytes(`${params.marketTitle}:${params.platform}:${Date.now()}`),
    );

    const tx = await this.reputationRegistry.giveFeedback(
      agentId,
      value,           // int128 value
      0,               // uint8 valueDecimals
      'trade',         // tag1
      params.platform, // tag2
      '',              // endpoint
      '',              // feedbackURI
      feedbackHash,    // feedbackHash
    );
    return tx.wait();
  }

  async getReputationSummary(): Promise<ReputationSummary> {
    const agentId = this.config.agentId ?? 0;
    const [summaryResult, clients] = await Promise.all([
      this.reputationRegistry.getSummary(agentId, [], '', ''),
      this.reputationRegistry.getClients(agentId),
    ]);

    return {
      agentId,
      totalFeedback: Number(summaryResult[0]),
      averageScore: Number(summaryResult[1]),
      clients: clients.map((c: string) => c),
    };
  }

  // ═══ Validation ═══

  async requestValidation(validator: string, requestURI: string): Promise<string> {
    const agentId = this.config.agentId ?? 0;
    const requestHash = ethers.keccak256(
      ethers.toUtf8Bytes(`${validator}:${agentId}:${requestURI}:${Date.now()}`),
    );

    const tx = await this.validationRegistry.validationRequest(
      validator,
      agentId,
      requestURI,
      requestHash,
    );
    await tx.wait();
    return requestHash;
  }

  async getValidationSummary(): Promise<ValidationSummary> {
    const agentId = this.config.agentId ?? 0;
    const [summaryResult, validationHashes] = await Promise.all([
      this.validationRegistry.getSummary(agentId, [], ''),
      this.validationRegistry.getAgentValidations(agentId),
    ]);

    return {
      agentId,
      totalValidations: Number(summaryResult[0]),
      averageResponse: Number(summaryResult[1]),
      validations: validationHashes.map((h: string) => ({
        requestHash: h,
        validator: '',
        response: 0,
        tag: '',
        lastUpdate: 0,
      })),
    };
  }

  // ═══ FlashAgent Bridge ═══

  async getFlashAgentStats(): Promise<FlashAgentStats> {
    if (!this.flashAgent) {
      return {
        totalTrades: 0,
        successfulTrades: 0,
        totalVolume: '0',
        successRate: 0,
        stateRoot: ethers.ZeroHash,
        isActive: false,
      };
    }

    try {
      const [stats, active] = await Promise.all([
        this.flashAgent.getAgentStats(0),
        this.flashAgent.isActive(0),
      ]);

      return {
        totalTrades: Number(stats[0]),
        successfulTrades: Number(stats[1]),
        totalVolume: ethers.formatEther(stats[2]),
        successRate: Number(stats[4]),
        stateRoot: stats[3],
        isActive: active,
      };
    } catch {
      return {
        totalTrades: 0,
        successfulTrades: 0,
        totalVolume: '0',
        successRate: 0,
        stateRoot: ethers.ZeroHash,
        isActive: false,
      };
    }
  }
}
