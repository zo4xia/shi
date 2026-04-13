import { localStore } from './store';
import { configService } from './config';
import {
  AGENT_ROLE_ORDER,
  getAgentRoleDisplayAvatar,
  getAgentRoleDisplayLabel,
  normalizeAgentRolesForSave,
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
  attachments?: RoomAttachment[];
  createdAt: number;
}

export interface RoomAttachment {
  path: string;
  name: string;
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

function buildMessagePromptBody(message: RoomMessage): string {
  const attachmentLines = (message.attachments ?? []).map((attachment) => `输入文件: ${attachment.path}`);
  return [message.content, ...attachmentLines].filter(Boolean).join('\n');
}

const buildTranscriptLines = (messages: RoomMessage[]): string[] => messages.slice(-16).map((message) => (
  `${message.senderName}: ${buildMessagePromptBody(message)}`
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
  const roles = normalizeAgentRolesForSave(resolveAgentRolesFromConfig(configService.getConfig()));
  return roleKeys.slice(0, ROOM_SEATS.length).map((roleKey, index) => ({
    seat: ROOM_SEATS[index].seat,
    seatLabel: ROOM_SEATS[index].seatLabel,
    roleKey,
    roleLabel: getAgentRoleDisplayLabel(roleKey, roles),
    roleShortLabel: getAgentRoleDisplayLabel(roleKey, roles),
    icon: getAgentRoleDisplayAvatar(roleKey, roles),
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
  // {标记} ROOM-EXECUTOR-BRIDGE:
  // Room 参与者不再直接前端私聊模型，而是绑定到后端 channel-style session，
  // 借现役 HttpSessionExecutor 吃到 role-home、attachment_read、role_home_*、连续性与工具兼容逻辑。
  const config = configService.getConfig();
  const roles = normalizeAgentRolesForSave(resolveAgentRolesFromConfig(config));
  const role = roles[participant.roleKey];

  if (!role?.apiUrl || !role?.modelId) {
    throw new Error(`${participant.roleLabel} 还没有配置可用的 API 和模型`);
  }

  const transcriptLines = buildTranscriptLines(room.messages);
  const userPrompt = buildRoomUserPrompt(room, participant, transcriptLines);
  const response = await fetch('/api/room/invoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      roomId: room.id,
      roleKey: participant.roleKey,
      roleLabel: participant.roleLabel,
      seatLabel: participant.seatLabel,
      prompt: userPrompt,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  const text = typeof payload.replyText === 'string' ? payload.replyText.trim() : '';
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
  const roles = normalizeAgentRolesForSave(resolveAgentRolesFromConfig(configService.getConfig()));
  return AGENT_ROLE_ORDER.map((roleKey) => ({
    roleKey,
    label: getAgentRoleDisplayLabel(roleKey, roles),
    shortLabel: getAgentRoleDisplayLabel(roleKey, roles),
    icon: getAgentRoleDisplayAvatar(roleKey, roles),
  }));
}
