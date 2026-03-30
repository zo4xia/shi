import { localStore } from './store';
import { configService } from './config';
import {
  AGENT_ROLE_ICONS,
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  AGENT_ROLE_SHORT_LABELS,
  normalizeAgentRolesForSave,
  pickNextApiKey,
  resolveAgentRolesFromConfig,
  type AgentRoleKey,
} from '../../shared/agentRoleConfig';

export type RoomStatus = 'active' | 'paused' | 'ended';
export type RoomSeatKey = 'A' | 'B' | 'C' | 'D';

export interface RoomParticipant {
  seat: RoomSeatKey;
  seatLabel: string;
  roleKey: AgentRoleKey;
  roleLabel: string;
  roleShortLabel: string;
  icon: string;
}

export interface RoomMessage {
  id: string;
  kind: 'human' | 'agent' | 'system';
  senderId: string;
  senderName: string;
  content: string;
  createdAt: number;
}

export interface RoomSessionRecord {
  id: string;
  title: string;
  status: RoomStatus;
  participants: RoomParticipant[];
  messages: RoomMessage[];
  createdAt: number;
  updatedAt: number;
}

const ROOM_STORE_KEY = 'uclaw.room.sessions.v1';
const ROOM_SEATS: Array<{ seat: RoomSeatKey; seatLabel: string }> = [
  { seat: 'A', seatLabel: 'A席位' },
  { seat: 'B', seatLabel: 'B席位' },
  { seat: 'C', seatLabel: 'C主席' },
  { seat: 'D', seatLabel: 'D席位' },
];

const createId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.trim().replace(/\/+$/, '');

const isVolcengineV3BaseUrl = (baseUrl: string): boolean => {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
};

const buildOpenAiUrl = (baseUrl: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return '/v1/chat/completions';
  }
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  if (normalized.includes('generativelanguage.googleapis.com')) {
    if (normalized.endsWith('/v1beta/openai') || normalized.endsWith('/v1/openai')) {
      return `${normalized}/chat/completions`;
    }
    if (normalized.endsWith('/v1beta')) {
      return `${normalized}/openai/chat/completions`;
    }
    if (normalized.endsWith('/v1')) {
      return `${normalized.slice(0, -3)}v1beta/openai/chat/completions`;
    }
    return `${normalized}/v1beta/openai/chat/completions`;
  }
  if (/\/v\d+$/.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
};

const buildAnthropicUrl = (baseUrl: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return '/v1/messages';
  }
  if (normalized.endsWith('/messages')) {
    return normalized;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/messages`;
  }
  return `${normalized}/v1/messages`;
};

const extractOpenAiText = (payload: any): string => {
  const directOutputText = typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
  if (directOutputText) {
    return directOutputText;
  }

  const nestedOutputText = typeof payload?.response?.output_text === 'string'
    ? payload.response.output_text.trim()
    : '';
  if (nestedOutputText) {
    return nestedOutputText;
  }

  const direct = payload?.choices?.[0]?.message?.content;
  if (typeof direct === 'string') {
    return direct.trim();
  }
  if (Array.isArray(direct)) {
    return direct
      .map((item: any) => {
        if (typeof item?.text === 'string') {
          return item.text;
        }
        if (typeof item?.content?.text === 'string') {
          return item.content.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  const output = Array.isArray(payload?.response?.output)
    ? payload.response.output
    : Array.isArray(payload?.output)
      ? payload.output
      : [];
  if (Array.isArray(output)) {
    const text = output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((contentItem: any) => (typeof contentItem?.text === 'string' ? contentItem.text : ''))
      .join('')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
};

const extractAnthropicText = (payload: any): string => {
  const content = Array.isArray(payload?.content) ? payload.content : [];
  return content
    .map((item: any) => (item?.type === 'text' && typeof item?.text === 'string' ? item.text : ''))
    .join('')
    .trim();
};

const buildTranscriptLines = (messages: RoomMessage[]): string[] => messages.slice(-16).map((message) => (
  `${message.senderName}: ${message.content}`
));

const buildRoomUserPrompt = (
  room: RoomSessionRecord,
  participant: RoomParticipant,
  transcriptLines: string[]
): string => {
  const participantsText = room.participants
    .map((item) => `${item.seatLabel} = ${item.roleLabel}`)
    .join('\n');

  return [
    `你正在 Room 里聊天，现在轮到你以 ${participant.seatLabel}（${participant.roleLabel}）的身份发言。`,
    '这里是轻松聊天房，不是正式工作流。',
    '可以聊天、接话、安慰、吐槽、玩接龙，也可以顺手给建议。',
    '回复自然一点，尽量简短，1 到 4 小段就够。',
    '如果你想点名下一位，请用 @A / @B / @C / @D 或 @角色名。',
    '',
    '房间成员：',
    participantsText,
    '',
    '最近对话：',
    transcriptLines.join('\n') || '（刚开始）',
  ].join('\n');
};

export async function loadRooms(): Promise<RoomSessionRecord[]> {
  const saved = await localStore.getItem<RoomSessionRecord[]>(ROOM_STORE_KEY);
  return Array.isArray(saved) ? saved : [];
}

export async function saveRooms(rooms: RoomSessionRecord[]): Promise<void> {
  await localStore.setItem(ROOM_STORE_KEY, rooms);
}

export function buildRoomParticipants(roleKeys: AgentRoleKey[]): RoomParticipant[] {
  return roleKeys.slice(0, ROOM_SEATS.length).map((roleKey, index) => ({
    seat: ROOM_SEATS[index].seat,
    seatLabel: ROOM_SEATS[index].seatLabel,
    roleKey,
    roleLabel: AGENT_ROLE_LABELS[roleKey],
    roleShortLabel: AGENT_ROLE_SHORT_LABELS[roleKey] ?? AGENT_ROLE_LABELS[roleKey],
    icon: AGENT_ROLE_ICONS[roleKey],
  }));
}

export function createRoom(roleKeys: AgentRoleKey[]): RoomSessionRecord {
  const now = Date.now();
  const participants = buildRoomParticipants(roleKeys);
  const title = `Room ${new Date(now).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  return {
    id: createId('room'),
    title,
    status: 'active',
    participants,
    messages: [
      {
        id: createId('room_msg'),
        kind: 'system',
        senderId: 'system',
        senderName: 'Room',
        content: `房间已打开，当前成员：${participants.map((item) => `${item.seatLabel}${item.roleLabel}`).join('、')}`,
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function appendRoomMessage(
  room: RoomSessionRecord,
  message: Omit<RoomMessage, 'id' | 'createdAt'>
): RoomSessionRecord {
  const nextMessage: RoomMessage = {
    id: createId('room_msg'),
    createdAt: Date.now(),
    ...message,
  };
  return {
    ...room,
    messages: [...room.messages, nextMessage],
    updatedAt: nextMessage.createdAt,
  };
}

export function resolveMentionTargets(room: RoomSessionRecord, text: string): RoomParticipant[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.includes('@全部') || normalized.includes('@all')) {
    return room.participants;
  }

  const targets: RoomParticipant[] = [];
  for (const participant of room.participants) {
    const aliases = [
      `@${participant.seat}`,
      `@${participant.seatLabel}`,
      `@${participant.roleLabel}`,
      `@${participant.roleShortLabel}`,
    ];
    if (aliases.some((alias) => normalized.includes(alias))) {
      targets.push(participant);
    }
  }

  if (targets.length > 0) {
    return targets;
  }

  return room.participants;
}

export async function invokeRoomParticipant(
  room: RoomSessionRecord,
  participant: RoomParticipant
): Promise<string> {
  const config = configService.getConfig();
  const roles = normalizeAgentRolesForSave(resolveAgentRolesFromConfig(config));
  const role = roles[participant.roleKey];

  if (!role?.apiUrl || !role?.modelId) {
    throw new Error(`${participant.roleLabel} 还没有配置可用的 API 和模型`);
  }

  const apiKey = pickNextApiKey(role.apiKey, `room:${participant.roleKey}`) || role.apiKey;
  const transcriptLines = buildTranscriptLines(room.messages);
  const userPrompt = buildRoomUserPrompt(room, participant, transcriptLines);

  if (!window.electron?.api?.fetch) {
    throw new Error('当前环境没有可用的 API 代理');
  }

  const useOpenAICompatibleFormat = role.apiFormat === 'openai' || isVolcengineV3BaseUrl(role.apiUrl);

  if (!useOpenAICompatibleFormat) {
    const response = await window.electron.api.fetch({
      url: buildAnthropicUrl(role.apiUrl),
      method: 'POST',
      headers: {
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: role.modelId,
        max_tokens: 600,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorMessage = response.data?.error?.message || response.data?.message || response.error || `请求失败 (${response.status})`;
      throw new Error(errorMessage);
    }

    const text = extractAnthropicText(response.data);
    if (!text) {
      throw new Error('没有拿到有效回复');
    }
    return text;
  }

  const response = await window.electron.api.fetch({
    url: buildOpenAiUrl(role.apiUrl),
    method: 'POST',
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: role.modelId,
      messages: [
        {
          role: 'system',
          content: '你在一个叫 Room 的轻松聊天房里发言。自然、简短、有人味，不要摆出工具说明口吻。',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorMessage = response.data?.error?.message || response.data?.message || response.error || `请求失败 (${response.status})`;
    throw new Error(errorMessage);
  }

  const text = extractOpenAiText(response.data);
  if (!text) {
    throw new Error('没有拿到有效回复');
  }
  return text;
}

export function getRoomRoleChoices(): Array<{
  roleKey: AgentRoleKey;
  label: string;
  shortLabel: string;
  icon: string;
}> {
  return AGENT_ROLE_ORDER.map((roleKey) => ({
    roleKey,
    label: AGENT_ROLE_LABELS[roleKey],
    shortLabel: AGENT_ROLE_SHORT_LABELS[roleKey] ?? AGENT_ROLE_LABELS[roleKey],
    icon: AGENT_ROLE_ICONS[roleKey],
  }));
}
