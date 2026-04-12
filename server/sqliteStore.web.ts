/**
 * Web-compatible SQLite Store
 * Uses sql.js without Electron dependencies
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { ensureDirectory, getProjectRoot, resolveRuntimeUserDataPath } from '../src/shared/runtimeDataPaths';

type ChangePayload<T = unknown> = {
  key: string;
  newValue: T | undefined;
  oldValue: T | undefined;
};

const DB_FILENAME = 'uclaw.sqlite';
const SAVE_DEBOUNCE_MS = 300;

export class SqliteStore {
  private db: Database;
  private dbPath: string;
  private emitter = new EventEmitter();
  private static sqlPromise: Promise<SqlJsStatic> | null = null;
  private pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPendingSave = false;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(userDataPath?: string): Promise<SqliteStore> {
    // {路标} FLOW-DB-BOOTSTRAP
    // {FLOW} DB-PATH-RESOLVE: Web 服务端数据库固定落到 runtime userDataPath/uclaw.sqlite，不走 Electron userData 目录。
    const basePath = userDataPath || resolveRuntimeUserDataPath(undefined, getProjectRoot());

    // Ensure directory exists
    ensureDirectory(basePath);

    const dbPath = path.join(basePath, DB_FILENAME);

    // Initialize SQL.js
    if (!SqliteStore.sqlPromise) {
      SqliteStore.sqlPromise = initSqlJs({
        locateFile: (file: string) => {
          // For web server, load from node_modules
          return path.join(getProjectRoot(), 'node_modules', 'sql.js', 'dist', file);
        }
      });
    }

    const SQL = await SqliteStore.sqlPromise;

    let db: Database;
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    const store = new SqliteStore(db, dbPath);
    store.initTables();
    return store;
  }

  private initTables(): void {
    // {路标} FLOW-TABLE-KV
    // Key-value store table
    // {标记} P0-KV-UPDATED-AT-ALIGN: kv 的 updated_at 是跨端迁移/观察的时间锚。
    // schema、旧库补列、set() 写路径必须同时一致，否则最基础的 store 写入都会炸。
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      )
    `);

    // Cowork config table (key-value for cowork settings)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cowork_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // {路标} FLOW-TABLE-COWORK-SESSIONS
    // Cowork sessions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cowork_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        claude_session_id TEXT,
        status TEXT DEFAULT 'idle',
        pinned INTEGER DEFAULT 0,
        cwd TEXT,
        system_prompt TEXT,
        execution_mode TEXT DEFAULT 'local',
        active_skill_ids TEXT DEFAULT '[]',
        agent_role_key TEXT,
        model_id TEXT,
        source_type TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // {路标} FLOW-TABLE-COWORK-MESSAGES
    // Cowork messages table
    // {标记} P0-A-FIX: 字段名与coworkStore.ts对齐(type/created_at/sequence), 约束与Electron版对齐
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cowork_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        sequence INTEGER,
        FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_cowork_messages_session_id ON cowork_messages(session_id)
    `);

    // {路标} FLOW-TABLE-MCP-SERVERS
    // MCP servers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        config_json TEXT NOT NULL DEFAULT '{}',
        agent_role_key TEXT DEFAULT 'all',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // {路标} FLOW-TABLE-SCHEDULED-TASKS
    // Scheduled tasks table
    // {标记} P0-C-FIX: 字段名与scheduledTaskStore.ts对齐, 约束与Electron版对齐
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule_json TEXT NOT NULL,
        prompt TEXT NOT NULL,
        working_directory TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        execution_mode TEXT NOT NULL DEFAULT 'local',
        expires_at TEXT,
        skill_ids_json TEXT NOT NULL DEFAULT '[]',
        notify_platforms_json TEXT NOT NULL DEFAULT '[]',
        completion_webhook_url TEXT,
        feishu_notify_agent_role_key TEXT,
        feishu_app_id TEXT,
        feishu_chat_id TEXT,
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        next_run_at_ms INTEGER,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        running_at_ms INTEGER,
        last_status TEXT,
        last_error TEXT,
        last_run_at_ms INTEGER,
        last_duration_ms INTEGER
      )
    `);

    // Task runs table
    // {标记} P0-C-FIX: trigger→trigger_type, 约束与Electron版对齐, 移除多余running_at_ms
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scheduled_task_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        session_id TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER,
        error TEXT,
        trigger_type TEXT NOT NULL DEFAULT 'scheduled',
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_task_id
        ON scheduled_task_runs(task_id, started_at DESC)
    `);

    // {路标} FLOW-TABLE-USER-MEMORIES
    // User memories table
    // {标记} P0-B-FIX: 添加fingerprint/last_used_at/agent_role_key/model_id, 约束与Electron版对齐
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.75,
        is_explicit INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'created',
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_memory_sources (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        session_id TEXT,
        message_id TEXT,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES user_memories(id) ON DELETE CASCADE
      )
    `);

    // {路标} FLOW-TABLE-IDENTITY-THREAD
    // {标记} P0-IDENTITY-BOUNDARY: 24h线程唯一边界是 agent_role_key；model_id 仅保留兼容字段，不参与身份隔离。
    this.db.run(`
      CREATE TABLE IF NOT EXISTS identity_thread_24h (
        id TEXT PRIMARY KEY,
        agent_role_key TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL,
        context TEXT NOT NULL DEFAULT '[]',
        channel_hint TEXT,
        message_count INTEGER DEFAULT 0,
        UNIQUE(agent_role_key)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_24h_expiry
        ON identity_thread_24h(expires_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_24h_channel
        ON identity_thread_24h(channel_hint, updated_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_24h_role_updated
        ON identity_thread_24h(agent_role_key, updated_at DESC)
    `);

    // {路标} FLOW-TABLE-SKILL-ROLE-CONFIGS
    // {标记} P0-1-FIX: 角色技能配置表（CoworkRunner直接DB读取需要此表）
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_role_configs (
        id TEXT PRIMARY KEY,
        role_key TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        skill_name TEXT NOT NULL,
        prefix TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        installed_at INTEGER,
        updated_at INTEGER,
        UNIQUE(role_key, skill_id)
      )
    `);

    // ── 迁移：为旧数据库补齐新增列 ──
    // {标记} P0-KV-UPDATED-AT-ALIGN: 旧 Web 库如果还是两列表 kv，启动时先补 updated_at，再统一落默认值。
    this.migrateAddColumn('kv', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');
    this.db.run(`UPDATE kv SET updated_at = COALESCE(updated_at, 0)`);
    // cowork_sessions
    this.migrateAddColumn('cowork_sessions', 'claude_session_id', 'TEXT');
    this.migrateAddColumn('cowork_sessions', 'agent_role_key', 'TEXT');
    this.migrateAddColumn('cowork_sessions', 'model_id', 'TEXT');
    this.migrateAddColumn('cowork_sessions', 'source_type', 'TEXT');

    // cowork_messages: 旧表用 role/timestamp，新表用 type/created_at
    // 如果旧列 role 和新列 type 同时存在（之前迁移不完整），需要重建表
    this.migrateRebuildIfNeeded('cowork_messages', ['role', 'timestamp'], `
      CREATE TABLE IF NOT EXISTS cowork_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        sequence INTEGER,
        FOREIGN KEY (session_id) REFERENCES cowork_sessions(id) ON DELETE CASCADE
      )
    `);
    this.migrateAddColumn('cowork_messages', 'type', "TEXT NOT NULL DEFAULT 'user'");
    this.migrateAddColumn('cowork_messages', 'created_at', 'INTEGER');
    this.migrateAddColumn('cowork_messages', 'agent_role_key', "TEXT DEFAULT 'organizer'");
    this.migrateAddColumn('cowork_messages', 'model_id', "TEXT DEFAULT ''");
    this.migrateAddColumn('cowork_messages', 'sequence', 'INTEGER');
    // user_memories
    this.migrateAddColumn('user_memories', 'fingerprint', "TEXT DEFAULT ''");
    this.migrateAddColumn('user_memories', 'agent_role_key', "TEXT DEFAULT 'organizer'");
    this.migrateAddColumn('user_memories', 'model_id', "TEXT DEFAULT ''");
    this.migrateAddColumn('user_memories', 'last_used_at', 'INTEGER');
    // mcp_servers: 旧表有 command/args/env 等列，新表用 config_json
    this.migrateRebuildIfNeeded('mcp_servers', ['command', 'args', 'env'], `
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        config_json TEXT NOT NULL DEFAULT '{}',
        agent_role_key TEXT DEFAULT 'all',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.migrateAddColumn('mcp_servers', 'config_json', "TEXT NOT NULL DEFAULT '{}'");
    this.migrateAddColumn('mcp_servers', 'agent_role_key', "TEXT DEFAULT 'all'");
    // scheduled_tasks: 旧列名迁移
    this.migrateRenameColumn('scheduled_tasks', 'schedule', 'schedule_json');
    this.migrateRenameColumn('scheduled_tasks', 'notify_platforms', 'notify_platforms_json');
    this.migrateRenameColumn('scheduled_tasks', 'last_run_at', 'last_run_at_ms');
    this.migrateAddColumn('scheduled_tasks', 'schedule_json', "TEXT NOT NULL DEFAULT '{}'");
    this.migrateAddColumn('scheduled_tasks', 'skill_ids_json', "TEXT NOT NULL DEFAULT '[]'");
    this.migrateAddColumn('scheduled_tasks', 'notify_platforms_json', "TEXT NOT NULL DEFAULT '[]'");
    this.migrateAddColumn('scheduled_tasks', 'completion_webhook_url', 'TEXT');
    this.migrateAddColumn('scheduled_tasks', 'feishu_notify_agent_role_key', 'TEXT');
    this.migrateAddColumn('scheduled_tasks', 'feishu_app_id', 'TEXT');
    this.migrateAddColumn('scheduled_tasks', 'feishu_chat_id', 'TEXT');
    this.migrateAddColumn('scheduled_tasks', 'agent_role_key', "TEXT DEFAULT 'organizer'");
    this.migrateAddColumn('scheduled_tasks', 'model_id', "TEXT DEFAULT ''");
    this.migrateAddColumn('scheduled_tasks', 'next_run_at_ms', 'INTEGER');
    this.migrateAddColumn('scheduled_tasks', 'consecutive_errors', 'INTEGER NOT NULL DEFAULT 0');
    this.migrateAddColumn('scheduled_tasks', 'last_run_at_ms', 'INTEGER');
    this.migrateAddColumn('scheduled_tasks', 'last_duration_ms', 'INTEGER');
    // scheduled_task_runs: 旧列名迁移
    this.migrateRenameColumn('scheduled_task_runs', 'trigger', 'trigger_type');
    this.migrateAddColumn('scheduled_task_runs', 'trigger_type', "TEXT NOT NULL DEFAULT 'scheduled'");
    this.migrateDropDeprecatedSchemaColumns();
    this.db.run(`DELETE FROM cowork_config WHERE key = 'executionMode'`);

    // {标记} P0-ROLE-MESSAGES-UNPOPULATED: 历史消息身份列必须与所属 session 对齐；
    // 不能再让 cowork_messages 继续吃默认 organizer/空 model，导致角色消息检索失真。
    this.db.run(`
      UPDATE cowork_messages
      SET
        agent_role_key = COALESCE(
          (SELECT NULLIF(cowork_sessions.agent_role_key, '') FROM cowork_sessions WHERE cowork_sessions.id = cowork_messages.session_id),
          agent_role_key
        ),
        model_id = COALESCE(
          (SELECT COALESCE(cowork_sessions.model_id, '') FROM cowork_sessions WHERE cowork_sessions.id = cowork_messages.session_id),
          model_id
        )
      WHERE EXISTS (
        SELECT 1
        FROM cowork_sessions
        WHERE cowork_sessions.id = cowork_messages.session_id
      )
    `);

    // ── 索引（放在迁移之后，确保列已存在） ──
    // {标记} P0-FIELD-SINGLE-RESPONSIBILITY: 这些组合索引里出现 model_id，只是为了读写局部性和兼容元信息，不代表 model_id 是身份边界。
    this.db.run(`DROP INDEX IF EXISTS idx_cowork_messages_identity`);
    this.db.run(`DROP INDEX IF EXISTS idx_mcp_servers_identity`);
    this.db.run(`DROP INDEX IF EXISTS idx_scheduled_tasks_identity`);
    this.db.run(`DROP INDEX IF EXISTS idx_user_memories_identity`);
    this.db.run(`DROP INDEX IF EXISTS idx_user_memory_sources_identity`);
    this.db.run(`DROP INDEX IF EXISTS idx_user_memory_sources_role_model_active`);
    this.db.run(`DROP INDEX IF EXISTS idx_user_memory_sources_role_active`);
    this.db.run(`DROP INDEX IF EXISTS idx_identity_thread_identity`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_cowork_messages_role_model_created ON cowork_messages(agent_role_key, model_id, created_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_cowork_messages_role_created ON cowork_messages(agent_role_key, created_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_mcp_servers_role_enabled ON mcp_servers(agent_role_key, enabled)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(enabled, next_run_at_ms)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_role_model_enabled ON scheduled_tasks(agent_role_key, model_id, enabled)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_role_enabled ON scheduled_tasks(agent_role_key, enabled)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memories_role_model_status_updated ON user_memories(agent_role_key, model_id, status, updated_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memories_role_status_updated ON user_memories(agent_role_key, status, updated_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memories_status_updated_at ON user_memories(status, updated_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memories_fingerprint ON user_memories(fingerprint)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memory_sources_session_id ON user_memory_sources(session_id, is_active)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_user_memory_sources_memory_id ON user_memory_sources(memory_id, is_active)`);

    this.save();
  }

  /** 安全地为已有表添加缺失列，列已存在则静默跳过 */
  private migrateAddColumn(table: string, column: string, typedef: string): void {
    try {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${typedef}`);
    } catch (e: any) {
      if (e?.message?.includes('duplicate column')) return;
      if (e?.message?.includes('no such table')) return;
      throw e;
    }
  }

  /** 如果表包含旧列名，DROP并重建（数据会丢失，仅用于schema不兼容的情况） */
  private migrateRebuildIfNeeded(table: string, oldCols: string[], createSql: string): void {
    try {
      const info = this.db.exec(`PRAGMA table_info("${table}")`);
      if (info.length === 0) return;
      const cols = info[0].values.map(r => r[1] as string);
      const hasOldCols = oldCols.some(c => cols.includes(c));
      if (!hasOldCols) return;
      console.log(`[Migration] Rebuilding table "${table}" (found legacy columns: ${oldCols.filter(c => cols.includes(c)).join(', ')})`);
      this.db.run(`DROP TABLE IF EXISTS "${table}"`);
      this.db.run(createSql);
    } catch (e: any) {
      console.warn(`[Migration] Failed to rebuild ${table}:`, e?.message);
    }
  }

  /** 安全地重命名列（旧列存在时才执行） */
  private migrateRenameColumn(table: string, oldCol: string, newCol: string): void {
    try {
      // 检查旧列是否存在
      const info = this.db.exec(`PRAGMA table_info("${table}")`);
      if (info.length === 0) return;
      const cols = info[0].values.map(r => r[1] as string);
      if (!cols.includes(oldCol)) return; // 旧列不存在，跳过
      if (cols.includes(newCol)) return;  // 新列已存在，跳过
      this.db.run(`ALTER TABLE "${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`);
    } catch (e: any) {
      // 如果 RENAME COLUMN 不支持（极旧版SQLite），静默跳过
      console.warn(`[Migration] Failed to rename ${table}.${oldCol} → ${newCol}:`, e?.message);
    }
  }

  private migrateDropDeprecatedSchemaColumns(): void {
    try {
      // {标记} P0-THREAD-REBUILD-DEDUPE: 这里明确允许清理旧不兼容 thread 数据，
      // 目标不是保留历史分叉，而是恢复“一个 role 只有一条 24h 广播板”的单一真相。
      this.rebuildTableDroppingColumns({
        table: 'identity_thread_24h',
        deprecatedColumns: ['last_message_id'],
        createSql: `
          CREATE TABLE IF NOT EXISTS identity_thread_24h (
            id TEXT PRIMARY KEY,
            agent_role_key TEXT NOT NULL,
            model_id TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            expires_at INTEGER NOT NULL,
            context TEXT NOT NULL DEFAULT '[]',
            channel_hint TEXT,
            message_count INTEGER DEFAULT 0,
            UNIQUE(agent_role_key)
          )
        `,
        insertSql: `
          WITH ranked AS (
            SELECT
              id,
              agent_role_key,
              COALESCE(model_id, '') AS model_id,
              created_at,
              updated_at,
              expires_at,
              COALESCE(context, '[]') AS context,
              channel_hint,
              COALESCE(message_count, 0) AS message_count,
              ROW_NUMBER() OVER (
                PARTITION BY agent_role_key
                ORDER BY updated_at DESC, created_at DESC, id DESC
              ) AS rn
            FROM identity_thread_24h__legacy
          )
          INSERT INTO identity_thread_24h (
            id, agent_role_key, model_id, created_at, updated_at, expires_at, context, channel_hint, message_count
          )
          SELECT
            id,
            agent_role_key,
            model_id,
            created_at,
            updated_at,
            expires_at,
            context,
            channel_hint,
            message_count
          FROM ranked
          WHERE rn = 1
        `,
      });
      // {标记} P0-SOURCE-TABLE-SINGLE-RESPONSIBILITY: user_memory_sources 只保来源关系本体；
      // role/model 元信息既不参与现役读取，也不该继续污染这张辅助表。
      this.rebuildTableDroppingColumns({
        table: 'user_memory_sources',
        deprecatedColumns: ['agent_role_key', 'model_id'],
        createSql: `
          CREATE TABLE IF NOT EXISTS user_memory_sources (
            id TEXT PRIMARY KEY,
            memory_id TEXT NOT NULL,
            session_id TEXT,
            message_id TEXT,
            role TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (memory_id) REFERENCES user_memories(id) ON DELETE CASCADE
          )
        `,
        insertSql: `
          INSERT INTO user_memory_sources (
            id, memory_id, session_id, message_id, role, is_active, created_at
          )
          SELECT
            id,
            memory_id,
            session_id,
            message_id,
            role,
            is_active,
            created_at
          FROM user_memory_sources__legacy
        `,
      });
    } catch (error) {
      console.warn('[Migration] Failed to drop deprecated schema columns:', error);
    }
  }

  private rebuildTableDroppingColumns(input: {
    table: string;
    deprecatedColumns: string[];
    createSql: string;
    insertSql: string;
  }): void {
    const info = this.db.exec(`PRAGMA table_info("${input.table}")`);
    if (info.length === 0) return;
    const cols = info[0].values.map(r => r[1] as string);
    const hasDeprecatedColumns = input.deprecatedColumns.some((column) => cols.includes(column));
    if (!hasDeprecatedColumns) return;
    const legacyTable = `${input.table}__legacy`;
    console.log(`[Migration] Rebuilding table "${input.table}" (dropping deprecated columns: ${input.deprecatedColumns.filter(c => cols.includes(c)).join(', ')})`);
    // {标记} P0-DEPRECATED-COLUMN-REBUILD: 旧库结构清洁必须事务包裹；
    // 失败时宁可整体回滚，也不能让现役表半建好、旧数据卡在 legacy 里。
    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run(`DROP TABLE IF EXISTS "${legacyTable}"`);
      this.db.run(`ALTER TABLE "${input.table}" RENAME TO "${legacyTable}"`);
      this.db.run(input.createSql);
      this.db.run(input.insertSql);
      this.db.run(`DROP TABLE IF EXISTS "${legacyTable}"`);
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  getDatabase(): Database {
    return this.db;
  }

  getSaveFunction(): () => void {
    return () => this.save();
  }

  save(): void {
    this.hasPendingSave = true;
    if (this.pendingSaveTimer) {
      return;
    }
    this.pendingSaveTimer = setTimeout(() => {
      this.pendingSaveTimer = null;
      this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  flush(): void {
    // {路标} FLOW-DB-FLUSH
    // {FLOW} DB-FLUSH-TO-DISK: 所有 kv / cowork / mcp / scheduled_tasks / memories 变更最终都收口到这里落盘。
    if (this.pendingSaveTimer) {
      clearTimeout(this.pendingSaveTimer);
      this.pendingSaveTimer = null;
    }
    if (!this.hasPendingSave) {
      return;
    }
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
    this.hasPendingSave = false;
  }

  // Alias for compatibility with main process SqliteStore
  initializeTables(): void {
    this.initTables();
  }

  // Event listener methods for compatibility
  onDidChange(callback: (payload: ChangePayload) => void): () => void {
    return this.onChange(callback);
  }

  // Legacy memory methods (no-op for web version)
  tryReadLegacyMemoryText(): { text: string } | null {
    return null;
  }

  parseLegacyMemoryEntries(): { id: string; text: string }[] {
    return [];
  }

  // User memories methods
  getUserMemories(): Array<{ id: string; text: string; confidence: number; status: string }> {
    const result = this.db.exec('SELECT id, text, confidence, status FROM user_memories WHERE status != "deleted"');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as string,
      text: row[1] as string,
      confidence: row[2] as number,
      status: row[3] as string,
    }));
  }

  // Additional methods for compatibility
  memoryFingerprint(): string {
    return '';
  }

  migrateLegacyMemoryFileToUserMemories(): Promise<number> {
    return Promise.resolve(0);
  }

  migrateFromElectronStore(): Promise<void> {
    return Promise.resolve();
  }

  get<T>(key: string): T | undefined {
    const result = this.db.exec('SELECT value FROM kv WHERE key = ?', [key]);
    if (result.length === 0 || result[0].values.length === 0) {
      return undefined;
    }
    try {
      return JSON.parse(result[0].values[0][0] as string) as T;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T): void {
    const oldValue = this.get(key);
    const valueStr = JSON.stringify(value);
    const now = Date.now();

    this.db.run(`
      INSERT INTO kv (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `, [key, valueStr, now]);
    this.save();

    this.emitter.emit('change', {
      key,
      newValue: value,
      oldValue,
    } as ChangePayload<T>);
  }

  delete(key: string): void {
    const oldValue = this.get(key);
    this.db.run('DELETE FROM kv WHERE key = ?', [key]);
    this.save();

    this.emitter.emit('change', {
      key,
      newValue: undefined,
      oldValue,
    } as ChangePayload);
  }

  onChange(callback: (payload: ChangePayload) => void): () => void {
    this.emitter.on('change', callback);
    return () => this.emitter.off('change', callback);
  }
}

export default SqliteStore;
