import type { BotRecord, BotStats, ActivityEvent, PlatformStats } from './constants.ts';

const API_BASE = '/api/v1';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data as T;
}

/* ── Platform ─────────────────────────────────────────────────── */

export const platformStats = () => get<PlatformStats>('/platform/stats');

/* ── Bots ─────────────────────────────────────────────────────── */

export const listBots = () => get<{ bots: BotRecord[]; total: number }>('/bots');

export const getBot = (id: string) => get<BotRecord>(`/bots/${id}`);

export const getBotStats = (id: string) => get<BotStats>(`/bots/${id}/stats`);

export const getBotActivity = (id: string, limit = 50) =>
  get<{ activity: ActivityEvent[]; total: number }>(`/bots/${id}/activity?limit=${limit}`);

/* ── Activity ─────────────────────────────────────────────────── */

export const activityFeed = (limit = 50) =>
  get<{ activity: ActivityEvent[]; total: number }>(`/activity/feed?limit=${limit}`);

/* ── Health ────────────────────────────────────────────────────── */

export const systemHealth = () =>
  get<{ status: string; service: string; version: string }>('/system/health');

export const connectorStatus = () =>
  get<Record<string, { ok: boolean; error?: string; enabled?: boolean }>>('/system/connectors');

/* ── Skill files ──────────────────────────────────────────────── */

export async function fetchSkillFile(filename: string): Promise<string> {
  const res = await fetch(`/${filename}`);
  if (!res.ok) throw new Error(`Failed to fetch ${filename}`);
  return res.text();
}
