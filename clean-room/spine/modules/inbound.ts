import type { AgentRoleKey, ChannelPlatform } from './contracts';
import type { RequestTrace } from './requestTrace';

export interface ImageAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

export interface InboundRequest {
  platform: ChannelPlatform;
  channelId: string;
  text: string;
  title?: string;
  systemPrompt?: string;
  skillIds?: string[];
  imageAttachments?: ImageAttachment[];
  cwd?: string;
  sessionId?: string;
  externalMessageId?: string;
  replyTargetId?: string;
  agentRoleKey: AgentRoleKey;
  modelId?: string;
  scopeKey?: string;
  zenMode?: boolean;
  confirmationMode?: 'modal' | 'text';
  autoApprove?: boolean;
  trace: RequestTrace;
}

export interface WebInboundInput {
  text: string;
  title?: string;
  systemPrompt?: string;
  skillIds?: string[];
  imageAttachments?: ImageAttachment[];
  cwd?: string;
  sessionId?: string;
  agentRoleKey: AgentRoleKey;
  modelId?: string;
  zenMode?: boolean;
  confirmationMode?: 'modal' | 'text';
  autoApprove?: boolean;
  trace: RequestTrace;
}

export interface FeishuInboundInput {
  chatId: string;
  text: string;
  messageId: string;
  imageAttachments?: ImageAttachment[];
  agentRoleKey: AgentRoleKey;
  modelId?: string;
  scopeKey: string;
  trace: RequestTrace;
}

export function createWebInboundRequest(input: WebInboundInput): InboundRequest {
  return {
    platform: 'web',
    channelId: input.sessionId || 'web:new',
    text: input.text,
    title: input.title,
    systemPrompt: input.systemPrompt,
    skillIds: input.skillIds,
    imageAttachments: input.imageAttachments,
    cwd: input.cwd,
    sessionId: input.sessionId,
    agentRoleKey: input.agentRoleKey,
    modelId: input.modelId,
    zenMode: input.zenMode,
    confirmationMode: input.confirmationMode,
    autoApprove: input.autoApprove,
    trace: input.trace,
  };
}

export function createFeishuInboundRequest(input: FeishuInboundInput): InboundRequest {
  return {
    platform: 'feishu',
    channelId: input.chatId,
    text: input.text,
    imageAttachments: input.imageAttachments,
    externalMessageId: input.messageId,
    replyTargetId: input.messageId,
    agentRoleKey: input.agentRoleKey,
    modelId: input.modelId,
    scopeKey: input.scopeKey,
    trace: input.trace,
  };
}
