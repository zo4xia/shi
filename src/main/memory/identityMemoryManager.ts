/**
 * Identity Memory Manager — 身份长期记忆管理
 *
 * 每个身份(agentRoleKey)有独立的长期记忆，
 * modelId 仅保留为元信息，不再作为长期记忆隔离键。
 * 存储在 user_memories 表中，按 agent_role_key 过滤。
 */

import crypto from 'crypto';
import type { Database } from 'sql.js';
import { normalizeMemoryMatchKey } from '../coworkStore/helpers';

function buildMemoryFingerprint(text: string): string {
  const key = normalizeMemoryMatchKey(text);
  return crypto.createHash('sha1').update(key).digest('hex');
}

// ─── 类型定义 ─────────────────────────────────────────────────────

export interface IdentityKey {
  agentRoleKey: string;
  // modelId is metadata only. Long-term memory isolation must stay on agentRoleKey.
  modelId?: string;
}

export interface UserInfo {
  name?: string;
  role?: string;
  team?: string;
  timezone?: string;
  preferences?: Record<string, string>;
}

export interface ProjectContext {
  name?: string;
  description?: string;
  techStack?: string[];
  goals?: string[];
}

export interface Decision {
  date: string;
  decision: string;
  context?: string;
  agentRoleKey?: string;
}

export interface Note {
  category?: string;
  topic: string;
  content: string;
  tags?: string[];
  date?: string;
  agentRoleKey?: string;
}

export interface IdentityMemory {
  userInfo: UserInfo;
  projectContext: ProjectContext;
  decisions: Decision[];
  notes: Note[];
}

// ─── Manager ─────────────────────────────────────────────────────

class IdentityMemoryManager {
  private db: Database | null = null;
  private saveDb: (() => void) | null = null;

  setDatabase(db: Database, saveDb: () => void): void {
    this.db = db;
    this.saveDb = saveDb;
  }

  async getIdentityMemory(identity: IdentityKey): Promise<IdentityMemory> {
    if (!this.db) return { userInfo: {}, projectContext: {}, decisions: [], notes: [] };

    const result = this.db.exec(
      'SELECT text FROM user_memories WHERE agent_role_key = ? AND status = ? ORDER BY updated_at ASC, created_at ASC',
      [identity.agentRoleKey, 'created']
    );

    const memories: IdentityMemory = { userInfo: {}, projectContext: {}, decisions: [], notes: [] };
    if (!result[0]) return memories;
    const seenDecisionKeys = new Set<string>();
    const seenNoteKeys = new Set<string>();

    for (const row of result[0].values) {
      const text = row[0] as string;
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'decision') {
          const key = `${parsed.date || ''}|${parsed.decision || ''}`;
          if (!seenDecisionKeys.has(key)) {
            seenDecisionKeys.add(key);
            memories.decisions.push(parsed);
          }
        } else if (parsed.type === 'note') {
          const key = `${parsed.topic || ''}|${parsed.content || ''}`;
          if (!seenNoteKeys.has(key)) {
            seenNoteKeys.add(key);
            memories.notes.push(parsed);
          }
        } else if (parsed.type === 'userInfo') {
          Object.assign(memories.userInfo, parsed.data);
        } else if (parsed.type === 'projectContext') {
          Object.assign(memories.projectContext, parsed.data);
        }
      } catch {
        // 纯文本记忆，作为note处理
        const key = `general|${text}`;
        if (!seenNoteKeys.has(key)) {
          seenNoteKeys.add(key);
          memories.notes.push({ topic: 'general', content: text });
        }
      }
    }

    return memories;
  }

  async updateIdentityMemory(identity: IdentityKey, updates: Partial<IdentityMemory>): Promise<void> {
    if (!this.db) return;

    const now = Date.now();
    const nowStr = new Date().toISOString();
    const modelId = identity.modelId || '';
    // {标记} P0-LAST-USED-AT-MIN-ACTIVATE: identityMemoryManager 和 coworkStore 共写同一张 user_memories；
    // 如果这里只写 created/updated_at，不写 last_used_at，就会把这张表重新分裂成两套时间语义。

    if (updates.userInfo && Object.keys(updates.userInfo).length > 0) {
      const text = JSON.stringify({ type: 'userInfo', data: updates.userInfo });
      const id = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;
      this.db.run(
        `INSERT INTO user_memories (id, text, fingerprint, confidence, is_explicit, status, agent_role_key, model_id, created_at, updated_at, last_used_at)
         VALUES (?, ?, ?, 1.0, 0, 'created', ?, ?, ?, ?, ?)`,
        [id, text, buildMemoryFingerprint(text), identity.agentRoleKey, modelId, nowStr, nowStr, now]
      );
    }

    if (updates.projectContext && Object.keys(updates.projectContext).length > 0) {
      const text = JSON.stringify({ type: 'projectContext', data: updates.projectContext });
      const id = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;
      this.db.run(
        `INSERT INTO user_memories (id, text, fingerprint, confidence, is_explicit, status, agent_role_key, model_id, created_at, updated_at, last_used_at)
         VALUES (?, ?, ?, 1.0, 0, 'created', ?, ?, ?, ?, ?)`,
        [id, text, buildMemoryFingerprint(text), identity.agentRoleKey, modelId, nowStr, nowStr, now]
      );
    }

    if (updates.decisions) {
      for (const d of updates.decisions) {
        const text = JSON.stringify({ type: 'decision', ...d });
        const id = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;
        this.db.run(
          `INSERT INTO user_memories (id, text, fingerprint, confidence, is_explicit, status, agent_role_key, model_id, created_at, updated_at, last_used_at)
           VALUES (?, ?, ?, 1.0, 0, 'created', ?, ?, ?, ?, ?)`,
          [id, text, buildMemoryFingerprint(text), identity.agentRoleKey, modelId, nowStr, nowStr, now]
        );
      }
    }

    if (updates.notes) {
      for (const n of updates.notes) {
        const text = JSON.stringify({ type: 'note', ...n });
        const id = `mem_${now}_${Math.random().toString(36).slice(2, 8)}`;
        this.db.run(
          `INSERT INTO user_memories (id, text, fingerprint, confidence, is_explicit, status, agent_role_key, model_id, created_at, updated_at, last_used_at)
           VALUES (?, ?, ?, 1.0, 0, 'created', ?, ?, ?, ?, ?)`,
          [id, text, buildMemoryFingerprint(text), identity.agentRoleKey, modelId, nowStr, nowStr, now]
        );
      }
    }

    if (this.saveDb) this.saveDb();
  }
}

export const identityMemoryManager = new IdentityMemoryManager();
