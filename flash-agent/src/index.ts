import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import flashPlugin from './plugin-flash/index.ts';
import { character } from './character.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('═══ Initializing Flash Agent ═══');
  logger.info({ name: character.name }, 'Agent:');
  logger.info('BNB Chain prediction market AI trader');
  logger.info('Platforms: Opinion.trade + Predict.fun');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [flashPlugin],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
