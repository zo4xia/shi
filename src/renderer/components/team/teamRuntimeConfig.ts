import { buildTeamRuntime } from '../../lib/handwriteAdapter';
import teamTaskExample from '../../mock/teamTask.example.json';
import type { TeamTaskDefinition } from '../../types/teamRuntime';

// #边界_Team配置层
// Team keeps its own runtime defaults so the feature can be unplugged from the
// main shell and moved as a self-contained module.
export const teamTaskDefinition = teamTaskExample as TeamTaskDefinition;
export const initialTeamRuntime = buildTeamRuntime(teamTaskDefinition);

export const teamStateChip = {
  done: 'bg-emerald-100 text-emerald-700',
  running: 'bg-amber-100 text-amber-700',
  queued: 'bg-slate-100 text-slate-600',
  blocked: 'bg-rose-100 text-rose-700',
} as const;

export const TEAM_CANVAS_VIEWPORT = {
  width: 960,
  height: 640,
} as const;

export const TEAM_CANVAS_ANCHORS = {
  question: { x: 62, y: 66 },
  answer: { x: 470, y: 66 },
  analysis: { x: 62, y: 332 },
  summary: { x: 470, y: 458 },
} as const;

export const TEAM_CANVAS_ANCHOR_ORDER = ['question', 'answer', 'analysis', 'summary'] as const;
export const TEAM_HORIZONTAL_RULER_MARKS = Array.from({ length: 13 }, (_, index) => index * 80);
export const TEAM_VERTICAL_RULER_MARKS = Array.from({ length: 9 }, (_, index) => index * 80);

export const TEAM_INPUT_CLASS = 'w-full rounded-[14px] border border-[#e3d9cf] bg-white px-3 py-2 text-sm';
export const TEAM_BUTTON_CLASS = 'rounded-full border border-[#d7c9be] bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-[#faf7f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/45';
export const TEAM_ACTION_BUTTON_CLASS = 'inline-flex w-full items-center justify-center rounded-full border border-[#e1d8ce] bg-white px-4 py-2 shadow-sm hover:bg-[#faf7f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]/45';
