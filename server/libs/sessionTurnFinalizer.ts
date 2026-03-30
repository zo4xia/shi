import type { CoworkStore, CoworkSession } from '../../src/main/coworkStore';
import { appendToIdentityThread } from './identityThreadHelper';

export class SessionTurnFinalizer {
  private readonly threadSavedIndexBySession = new Map<string, number>();

  constructor(private readonly store: CoworkStore) {}

  prepareTurn(sessionId: string): void {
    // {FLOW} CONTINUITY-TRUNK-FINALIZER-PREPARE
    // {BREAKPOINT} continuity-shared-thread-finalize-001
    // 【1.0链路】TURN-PREPARE: 记住本轮开始前的消息边界，避免共享记忆重复写入旧消息。
    if (this.threadSavedIndexBySession.has(sessionId)) {
      return;
    }

    const session = this.store.getSession(sessionId);
    if (!session) {
      return;
    }

    this.threadSavedIndexBySession.set(sessionId, Math.max(0, session.messages.length - 1));
  }

  async finalize(sessionId: string): Promise<void> {
    // {FLOW} CONTINUITY-TRUNK-FINALIZER-WRITE
    // {BREAKPOINT} continuity-shared-thread-finalize-001
    // 【1.0链路】TURN-FINALIZE: 每轮结束先做归档，再把本轮新增 user/assistant 写入共享线程。
    try {
      this.store.runDailyConversationBackupIfConfigured();
      this.saveToSharedThread(sessionId);
    } finally {
      this.threadSavedIndexBySession.delete(sessionId);
    }
  }

  private saveToSharedThread(sessionId: string): void {
    // {FLOW} CONTINUITY-TRUNK-THREAD-APPEND
    // {标记} 真相边界: 这里只把本轮 user/assistant 正文写入广播板式共享线程，不把 thinking/system/tool 当连续性正文。
    // 【1.0链路】SHARED-THREAD-WRITE: 共享线程只收正文 user/assistant，不收 thinking/system/tool 噪音。
    const session = this.store.getSession(sessionId);
    if (!session || !session.agentRoleKey || session.messages.length === 0) {
      return;
    }

    const savedIndex = this.threadSavedIndexBySession.get(sessionId) ?? 0;
    const newMessages = session.messages.slice(savedIndex);
    const toSave = newMessages.filter((message) => {
      if (message.type === 'user' && message.content?.trim()) {
        return true;
      }
      if (message.type === 'assistant' && message.content?.trim() && !message.metadata?.isThinking) {
        return true;
      }
      return false;
    });

    this.threadSavedIndexBySession.set(sessionId, session.messages.length);
    if (toSave.length === 0) {
      return;
    }

    const db = this.store.getDatabase();
    const save = this.store.getSaveFunction();
    const channelHint = inferSharedThreadChannelHint(session);

    for (const message of toSave) {
      appendToIdentityThread(
        db,
        session.agentRoleKey,
        {
          role: message.type === 'user' ? 'user' : 'assistant',
          content: message.content,
        },
        channelHint
      );
    }

    save();
  }
}

function inferSharedThreadChannelHint(session: Pick<CoworkSession, 'systemPrompt' | 'title' | 'sourceType'>): string {
  // {标记} P1-CHANNEL-HINT-EXPLICIT: 共享线程优先读显式 sourceType，推断仅作兼容兜底。
  if (session.sourceType === 'desktop') {
    return 'desktop';
  }
  if (session.sourceType === 'external') {
    const scope = session.systemPrompt?.trim() ?? '';
    if (
      scope.startsWith('im:feishu:chat:')
      || scope.startsWith('im:feishu:ws:')
      || scope.startsWith('im:feishu:app:')
    ) {
      return 'feishu';
    }
    if (scope.startsWith('im:dingtalk:chat:')) {
      return 'dingtalk';
    }
    if (scope.startsWith('im:wechatbot:user:')) {
      return 'wechatbot';
    }
    return 'external';
  }

  // 【1.0链路】CHANNEL-HINT: 兼容旧数据，按 systemPrompt/title 兜底推断来源渠道。
  const scope = session.systemPrompt?.trim() ?? '';
  if (
    scope.startsWith('im:feishu:chat:')
    || scope.startsWith('im:feishu:ws:')
    || scope.startsWith('im:feishu:app:')
  ) {
    return 'feishu';
  }
  if (scope.startsWith('im:dingtalk:chat:')) {
    return 'dingtalk';
  }
  if (scope.startsWith('im:wechatbot:user:')) {
    return 'wechatbot';
  }

  const title = session.title?.trim() ?? '';
  if (title.endsWith(' - 飞书对话')) {
    return 'feishu';
  }
  if (title.endsWith(' - 钉钉对话')) {
    return 'dingtalk';
  }

  return 'desktop';
}
