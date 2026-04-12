import type { CoworkSessionSummary } from '../../types/cowork';

export type SessionSourceFilter = 'all' | 'desktop' | 'external';

export function normalizeSessionSourceFilter(filter: string | null | undefined): SessionSourceFilter {
  if (filter === 'desktop' || filter === 'external' || filter === 'all') {
    return filter;
  }
  return 'all';
}

const LEGACY_HIDDEN_SCOPE_PREFIXES = ['im:feishu:ws:', 'im:feishu:app:'];

const CHANNEL_PREFIXES = ['im:feishu:', 'im:dingtalk:', 'im:telegram:', 'im:discord:', 'im:wecom:', 'im:qq:'];
const EXTERNAL_TITLE_MARKERS = ['飞书对话', '钉钉对话', 'Telegram', 'Discord', '企业微信', 'QQ'];

export function isLegacyHiddenSession(session: Pick<CoworkSessionSummary, 'systemPrompt'>): boolean {
  const systemPrompt = (session.systemPrompt || '').trim().toLowerCase();
  return LEGACY_HIDDEN_SCOPE_PREFIXES.some((prefix) => systemPrompt.startsWith(prefix));
}

export function inferSessionSource(session: Pick<CoworkSessionSummary, 'title' | 'systemPrompt' | 'sourceType'>): Exclude<SessionSourceFilter, 'all'> {
  // {标记} DISPLAY_ONLY: sourceType 存在时它才是后端真相；下面这些 systemPrompt/title 分支只是 legacy 数据的展示/筛选启发式。
  if (session.sourceType === 'desktop' || session.sourceType === 'external') {
    return session.sourceType;
  }

  const systemPrompt = (session.systemPrompt || '').trim().toLowerCase();
  if (CHANNEL_PREFIXES.some((prefix) => systemPrompt.startsWith(prefix))) {
    return 'external';
  }

  const title = (session.title || '').trim();
  if (EXTERNAL_TITLE_MARKERS.some((marker) => title.includes(marker))) {
    return 'external';
  }

  return 'desktop';
}

export function matchesSessionSourceFilter(
  session: Pick<CoworkSessionSummary, 'title' | 'systemPrompt' | 'sourceType'>,
  filter: SessionSourceFilter
): boolean {
  const normalizedFilter = normalizeSessionSourceFilter(filter);
  if (normalizedFilter === 'all') {
    return true;
  }
  return inferSessionSource(session) === normalizedFilter;
}

export function buildSessionPreviewText(session: Pick<CoworkSessionSummary, 'title' | 'agentRoleKey'>): string {
  const title = (session.title || '').trim();
  if (!title) {
    return '未命名对话';
  }
  return title.length > 42 ? `${title.slice(0, 42)}...` : title;
}
