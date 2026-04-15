import { Request, Response, Router } from 'express';
import { buildChannelBindingKey, bindChannelSession, findLatestScopedSession, getBoundChannelSession } from '../libs/channelSessionBinding';
import {
  buildExportVerificationResult,
  collectExportSnapshot,
  collectNewExportEntries,
  looksLikeExportIntent,
  resolveExportRoots,
} from '../libs/exportVerification';
import { getOrCreateWebSessionExecutor } from '../libs/httpSessionExecutor';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import { partitionSkillIdsByHandling } from '../../src/shared/systemHandledSkills';
import type { RequestContext } from '../src/index';
import type { CoworkSession } from '../../src/main/coworkStore';

type RoomInvokeRequestBody = {
  roomId?: string;
  roleKey?: string;
  roleLabel?: string;
  seatLabel?: string;
  prompt?: string;
  workspaceRoot?: string;
  imageAttachments?: Array<{
    name: string;
    mimeType: string;
    base64Data: string;
  }>;
};

function extractNewAssistantReplies(
  session: { messages?: Array<{ id?: string; type?: string; content?: string; metadata?: Record<string, unknown> }> } | null,
  knownIds: Set<string>
): string[] {
  if (!session?.messages?.length) {
    return [];
  }

  return session.messages
    .filter((message) => (
      message.type === 'assistant'
      && typeof message.id === 'string'
      && !knownIds.has(message.id)
      && !message.metadata?.isThinking
      && (() => {
        const stage = typeof message.metadata?.stage === 'string'
          ? message.metadata.stage.trim()
          : '';
        return !stage || stage === 'final_result';
      })()
    ))
    .map((message) => message.content?.trim())
    .filter((content): content is string => Boolean(content));
}

function extractLatestSystemError(
  session: { messages?: Array<{ type?: string; content?: string }> } | null
): string {
  if (!session?.messages?.length) {
    return '';
  }

  const latest = session.messages
    .slice()
    .reverse()
    .find((message) => message.type === 'system' && typeof message.content === 'string' && message.content.trim());

  return latest?.content?.trim() || '';
}

function buildRoomTurnSystemPrompt(params: {
  seatLabel: string;
  roleLabel: string;
}): string {
  return [
    `你正在 Room 里聊天，现在轮到你以 ${params.seatLabel}（${params.roleLabel}）的身份发言。`,
    '这里是轻松聊天房，不是正式汇报流。',
    '先像活的小家伙，再像助手。可以聊天、接话、安慰、吐槽、玩接龙，也可以顺手给建议。',
    '回复自然一点，有人味一点，不要退化成客服口吻、工具说明口吻、模板式一问一答。',
    '如果你想点名下一位，可以用 @A / @B / @C / @D 或 @角色名。',
  ].join('\n');
}

function getOrCreateRoomSession(
  context: RequestContext,
  params: {
    roomId: string;
    roleKey: string;
    roleLabel: string;
  }
): CoworkSession {
  const scopeKey = `room:${params.roomId}`;
  const bindingKey = buildChannelBindingKey('room', scopeKey, params.roleKey);
  const bound = getBoundChannelSession(context.store, context.coworkStore, bindingKey);
  if (bound) {
    return bound;
  }

  const scoped = findLatestScopedSession(context.coworkStore, {
    agentRoleKey: params.roleKey,
    scopeKeys: [scopeKey],
  });
  if (scoped) {
    bindChannelSession(context.store, bindingKey, scoped.id, scopeKey);
    return scoped;
  }

  const session = context.coworkStore.createSession(
    `${params.roleLabel} - Room`,
    getProjectRoot(),
    scopeKey,
    'local',
    [],
    {
      agentRoleKey: params.roleKey,
      sourceType: 'external',
    },
  );
  bindChannelSession(context.store, bindingKey, session.id, scopeKey);
  return session;
}

export function setupRoomRoutes(app: Router) {
  const router = Router();

  router.post('/invoke', async (req: Request, res: Response) => {
    try {
      const context = req.context as RequestContext;
      const body = (req.body ?? {}) as RoomInvokeRequestBody;
      const roomId = String(body.roomId || '').trim();
      const roleKey = String(body.roleKey || '').trim();
      const roleLabel = String(body.roleLabel || roleKey).trim() || roleKey;
      const seatLabel = String(body.seatLabel || '').trim() || roleLabel;
      const prompt = String(body.prompt || '').trim();

      if (!roomId) {
        return res.status(400).json({ success: false, error: 'roomId is required' });
      }
      if (!roleKey) {
        return res.status(400).json({ success: false, error: 'roleKey is required' });
      }
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      const session = getOrCreateRoomSession(context, {
        roomId,
        roleKey,
        roleLabel,
      });
      const baseSession = context.coworkStore.getSession(session.id) as any;
      const knownIds = new Set<string>(
        (baseSession?.messages ?? [])
          .map((message: any) => (typeof message?.id === 'string' ? message.id : ''))
          .filter(Boolean),
      );

      const executor = getOrCreateWebSessionExecutor({
        store: context.coworkStore,
        configStore: context.store,
        buildSelectedSkillsPrompt: (skillIds: string[]) => {
          const { promptHandled } = partitionSkillIdsByHandling(skillIds);
          if (promptHandled.length === 0) {
            return null;
          }
          return context.skillManager.buildSelectedSkillsPrompt(promptHandled);
        },
      });
      const exportIntent = looksLikeExportIntent(prompt);
      const exportRoots = resolveExportRoots(
        context.store.get('app_config') as Parameters<typeof resolveExportRoots>[0],
        roleKey,
      );
      const beforePrimarySnapshot = collectExportSnapshot(exportRoots.primary);
      const beforeLegacySnapshot = collectExportSnapshot(exportRoots.legacy);

      await executor.runChannelFastTurn(session.id, prompt, {
        imageAttachments: body.imageAttachments,
        confirmationMode: 'text',
        autoApprove: true,
        workspaceRoot: getProjectRoot(),
        systemPrompt: buildRoomTurnSystemPrompt({ seatLabel, roleLabel }),
      });

      const completed = context.coworkStore.getSession(session.id) as any;
      const replies = extractNewAssistantReplies(completed, knownIds);
      const replyText = replies.join('\n\n').trim();
      const systemError = extractLatestSystemError(completed);
      const afterPrimarySnapshot = collectExportSnapshot(exportRoots.primary);
      const afterLegacySnapshot = collectExportSnapshot(exportRoots.legacy);
      const exportVerification = buildExportVerificationResult({
        exportIntent,
        roots: exportRoots,
        newPrimaryEntries: collectNewExportEntries(beforePrimarySnapshot, afterPrimarySnapshot),
        newLegacyEntries: collectNewExportEntries(beforeLegacySnapshot, afterLegacySnapshot),
      });
      const exportVerificationText = exportVerification.message.trim();
      const finalReplyText = [replyText, exportVerificationText]
        .filter((part) => Boolean(String(part || '').trim()))
        .join('\n\n')
        .trim();

      if (finalReplyText) {
        return res.json({
          success: true,
          sessionId: session.id,
          replyText: finalReplyText,
          exportVerification,
        });
      }

      if (systemError) {
        return res.json({
          success: true,
          sessionId: session.id,
          replyText: [`这轮没顺利说出来。${systemError}`, exportVerificationText]
            .filter((part) => Boolean(String(part || '').trim()))
            .join('\n\n'),
          exportVerification,
        });
      }

      return res.json({
        success: true,
        sessionId: session.id,
        replyText: ['这轮我听见了，但还没顺利组织出回复。你可以再戳我一下，或者换个更短一点的说法。', exportVerificationText]
          .filter((part) => Boolean(String(part || '').trim()))
          .join('\n\n'),
        exportVerification,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to invoke room participant',
      });
    }
  });

  app.use('/api/room', router);
}
