/**
 * Lightweight type definitions replacing @elizaos/core.
 * Only the types actually used by Flash Gateway source files.
 */

export interface IAgentRuntime {
  getSetting?(key: string): string | undefined;
  [key: string]: unknown;
}

export interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
  providers?: Provider[];
  services?: unknown[];
  [key: string]: unknown;
}

export interface Memory {
  id?: string;
  content: { text: string; [key: string]: unknown };
  roomId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface State {
  [key: string]: unknown;
}

export interface Content {
  text: string;
  [key: string]: unknown;
}

export type HandlerCallback = (response: Content & { action?: string; error?: boolean }) => Promise<void>;

export interface Action {
  name: string;
  description: string;
  similes?: string[];
  examples?: unknown[];
  validate?: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<boolean>;
  handler?: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => Promise<unknown>;
  [key: string]: unknown;
}

export interface Provider {
  name?: string;
  get: (runtime: IAgentRuntime, message: Memory, state?: State) => Promise<string>;
}

export interface Character {
  name: string;
  plugins?: (string | Plugin)[];
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Project {
  agents: ProjectAgent[];
  [key: string]: unknown;
}

export interface ProjectAgent {
  character: Character;
  plugins?: Plugin[];
  [key: string]: unknown;
}

export type UUID = string;

export enum ModelType {
  TEXT_SMALL = 'TEXT_SMALL',
  TEXT_LARGE = 'TEXT_LARGE',
}

export const logger = {
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
  log: (...args: unknown[]) => console.log(...args),
};
