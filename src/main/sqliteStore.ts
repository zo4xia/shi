import { app } from './electron';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { DB_FILENAME } from './appConstants';
import { getBundledNodeModuleEntry, getRuntimeAppPath } from './libs/runtimeLayout';
import { getProjectRoot } from '../shared/runtimeDataPaths';

type ChangePayload<T = unknown> = {
  key: string;
  newValue: T | undefined;
  oldValue: T | undefined;
};

const USER_MEMORIES_MIGRATION_KEY = 'userMemories.migration.v1.completed';

// Pre-read the sql.js WASM binary from disk.
// Using fs.readFileSync (which handles non-ASCII paths via Windows wide-char APIs)
// and passing the buffer directly to initSqlJs bypasses Emscripten's file loading,
// which can fail or hang when the install path contains Chinese characters on Windows.
function loadWasmBinary(): ArrayBuffer {
  const wasmPath = getBundledNodeModuleEntry('sql.js', 'dist', 'sql-wasm.wasm');
  const buf = fs.readFileSync(wasmPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export class SqliteStore {
  private db: Database;
  private dbPath: string;
  private emitter = new EventEmitter();
  private static sqlPromise: Promise<SqlJsStatic> | null = null;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(userDataPath?: string): Promise<SqliteStore> {
    const basePath = userDataPath ?? app.getPath('userData');
    const dbPath = path.join(basePath, DB_FILENAME);

    // Initialize SQL.js with WASM file path (cached promise for reuse)
    if (!SqliteStore.sqlPromise) {
      const wasmBinary = loadWasmBinary();
      SqliteStore.sqlPromise = initSqlJs({
        wasmBinary,
      });
    }
    const SQL = await SqliteStore.sqlPromise;

    // Load existing database or create new one
    let db: Database;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    const store = new SqliteStore(db, dbPath);
    store.initializeTables(basePath);
    return store;
  }

  private initializeTables(basePath: string) {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Create cowork tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cowork_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        claude_session_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        pinned INTEGER NOT NULL DEFAULT 0,
        cwd TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        execution_mode TEXT,
        agent_role_key TEXT,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

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
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_cowork_messages_session_id ON cowork_messages(session_id);
    `);

    // {标记} P1-数据库字段补全：消息表身份索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_cowork_messages_identity
      ON cowork_messages(agent_role_key, model_id, created_at DESC);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS cowork_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

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
      );
    `);

    // {标记} P1-BUG-FIX: 用户记忆身份隔离 - 添加索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_identity
      ON user_memories(agent_role_key, model_id, status, updated_at DESC);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_memory_sources (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        session_id TEXT,
        message_id TEXT,
        role TEXT NOT NULL DEFAULT 'system',
        is_active INTEGER NOT NULL DEFAULT 1,
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES user_memories(id) ON DELETE CASCADE
      );
    `);

    // {标记} P1-数据库字段补全：记忆来源表身份索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memory_sources_identity
      ON user_memory_sources(agent_role_key, model_id, is_active);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_status_updated_at
      ON user_memories(status, updated_at DESC);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memories_fingerprint
      ON user_memories(fingerprint);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memory_sources_session_id
      ON user_memory_sources(session_id, is_active);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_user_memory_sources_memory_id
      ON user_memory_sources(memory_id, is_active);
    `);

    // Create scheduled tasks tables
    // {标记} P0-BUG-FIX: 添加 agent_role_key 和 model_id 字段用于身份绑定
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
        agent_role_key TEXT DEFAULT 'organizer',
        model_id TEXT DEFAULT '',
        next_run_at_ms INTEGER,
        last_run_at_ms INTEGER,
        last_status TEXT,
        last_error TEXT,
        last_duration_ms INTEGER,
        running_at_ms INTEGER,
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // {标记} P0-BUG-FIX: 数据库迁移 - 为现有表添加身份字段
    this.migrateScheduledTasksAddIdentityColumns();

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
        ON scheduled_tasks(enabled, next_run_at_ms);
    `);

    // {标记} P1-数据库字段补全：定时任务身份索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_identity
        ON scheduled_tasks(agent_role_key, model_id, enabled);
    `);

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
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_task_runs_task_id
        ON scheduled_task_runs(task_id, started_at DESC);
    `);

    // Create MCP servers table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        config_json TEXT NOT NULL DEFAULT '{}',
        agent_role_key TEXT DEFAULT 'all',
        model_id TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // {标记} P1-技能隔离：MCP 服务器身份索引
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_identity
      ON mcp_servers(agent_role_key, enabled);
    `);

    // {标记} P1-技能隔离：角色技能配置表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS skill_role_configs (
        id TEXT PRIMARY KEY,
        role_key TEXT NOT NULL,  -- organizer/writer/designer/analyst/all
        skill_id TEXT NOT NULL,
        skill_name TEXT NOT NULL DEFAULT '',
        prefix TEXT NOT NULL DEFAULT 'public_',  -- public_ / organizer_ / writer_ / ...
        enabled INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL DEFAULT '{}',
        installed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(role_key, skill_id)
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_skill_role_configs_role
      ON skill_role_configs(role_key, enabled);
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_skill_role_configs_skill
      ON skill_role_configs(skill_id, role_key);
    `);

    // Create identity thread table - 24h hot cache for cross-channel memory sharing
    // {标记} P0-IDENTITY-BOUNDARY: 唯一身份边界是 agent_role_key；model_id 仅保留为运行元信息。
    this.db.run(`
      CREATE TABLE IF NOT EXISTS identity_thread_24h (
        id TEXT PRIMARY KEY,
        agent_role_key TEXT NOT NULL,
        model_id TEXT NOT NULL,
        context TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        channel_hint TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        UNIQUE(agent_role_key)
      );
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_identity ON identity_thread_24h(agent_role_key, model_id);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_role_only ON identity_thread_24h(agent_role_key, updated_at DESC);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_expires ON identity_thread_24h(expires_at);
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_identity_thread_role_updated ON identity_thread_24h(agent_role_key, updated_at DESC);
    `);

    // Migrations - safely add columns if they don't exist
    try {
      // Check if execution_mode column exists
      const colsResult = this.db.exec("PRAGMA table_info(cowork_sessions);");
      const columns = colsResult[0]?.values.map((row) => row[1]) || [];

      if (!columns.includes('execution_mode')) {
        this.db.run('ALTER TABLE cowork_sessions ADD COLUMN execution_mode TEXT;');
        this.save();
      }

      if (!columns.includes('pinned')) {
        this.db.run('ALTER TABLE cowork_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;');
        this.save();
      }

      if (!columns.includes('active_skill_ids')) {
        this.db.run('ALTER TABLE cowork_sessions ADD COLUMN active_skill_ids TEXT;');
        this.save();
      }

      if (!columns.includes('agent_role_key')) {
        this.db.run('ALTER TABLE cowork_sessions ADD COLUMN agent_role_key TEXT;');
        this.save();
      }

      if (!columns.includes('model_id')) {
        this.db.run('ALTER TABLE cowork_sessions ADD COLUMN model_id TEXT;');
        this.save();
      }

      // Migration: Add sequence column to cowork_messages
      const msgColsResult = this.db.exec("PRAGMA table_info(cowork_messages);");
      const msgColumns = msgColsResult[0]?.values.map((row) => row[1]) || [];

      if (!msgColumns.includes('sequence')) {
        this.db.run('ALTER TABLE cowork_messages ADD COLUMN sequence INTEGER');

        // 为现有消息按 created_at 和 ROWID 分配序列号
        this.db.run(`
          WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY session_id
              ORDER BY created_at ASC, ROWID ASC
            ) as seq
            FROM cowork_messages
          )
          UPDATE cowork_messages
          SET sequence = (SELECT seq FROM numbered WHERE numbered.id = cowork_messages.id)
        `);

        this.save();
      }
    } catch {
      // Column already exists or migration not needed.
    }

    try {
      this.db.run('UPDATE cowork_sessions SET pinned = 0 WHERE pinned IS NULL;');
    } catch {
      // Column might not exist yet.
    }

    try {
      this.db.run(`UPDATE cowork_sessions SET execution_mode = 'local' WHERE execution_mode IN ('container', 'sandbox', 'auto');`);
      this.db.run(`
        UPDATE cowork_config
        SET value = 'local'
        WHERE key = 'executionMode' AND value IN ('container', 'sandbox', 'auto');
      `);
    } catch (error) {
      console.warn('Failed to migrate cowork execution mode:', error);
    }

    // Migration: Add expires_at and notify_platforms_json columns to scheduled_tasks
    try {
      const stColsResult = this.db.exec("PRAGMA table_info(scheduled_tasks);");
      if (stColsResult[0]) {
        const stColumns = stColsResult[0].values.map((row) => row[1]) || [];

        if (!stColumns.includes('expires_at')) {
          this.db.run('ALTER TABLE scheduled_tasks ADD COLUMN expires_at TEXT');
          this.save();
        }

        if (!stColumns.includes('notify_platforms_json')) {
          this.db.run("ALTER TABLE scheduled_tasks ADD COLUMN notify_platforms_json TEXT NOT NULL DEFAULT '[]'");
          this.save();
        }

        if (!stColumns.includes('completion_webhook_url')) {
          this.db.run('ALTER TABLE scheduled_tasks ADD COLUMN completion_webhook_url TEXT');
          this.save();
        }

        if (!stColumns.includes('skill_ids_json')) {
          this.db.run("ALTER TABLE scheduled_tasks ADD COLUMN skill_ids_json TEXT NOT NULL DEFAULT '[]'");
          this.save();
        }
      }
    } catch {
      // Migration not needed or table doesn't exist yet.
    }

    this.migrateLegacyMemoryFileToUserMemories();
    this.migrateFromElectronStore(basePath);
    this.migrateScheduledTasksAddIdentityColumns();  // P0 迁移
    this.migrateUserMemoriesAddIdentityColumns();    // P1 迁移
    this.migrateCreateSkillRoleConfigs();            // P1 技能隔离
    this.save();
  }

  // {标记} P0-BUG-FIX: 定时任务身份绑定迁移
  private migrateScheduledTasksAddIdentityColumns(): void {
    try {
      // Check if table exists
      const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'");
      if (!tableCheck.length || !tableCheck[0].values.length) {
        return; // Table doesn't exist yet
      }

      // Get current columns
      const pragma = this.db.exec('PRAGMA table_info(scheduled_tasks)');
      const columns = pragma[0]?.values.map((row) => (row[1] as string).toLowerCase()) || [];

      // Add agent_role_key column if missing
      if (!columns.includes('agent_role_key')) {
        console.log('[SQLite] Adding agent_role_key column to scheduled_tasks');
        this.db.run("ALTER TABLE scheduled_tasks ADD COLUMN agent_role_key TEXT DEFAULT 'organizer'");
        this.save();
      }

      // Add model_id column if missing
      if (!columns.includes('model_id')) {
        console.log('[SQLite] Adding model_id column to scheduled_tasks');
        this.db.run("ALTER TABLE scheduled_tasks ADD COLUMN model_id TEXT DEFAULT ''");
        this.save();
      }
    } catch (error) {
      console.warn('[SQLite] Failed to migrate scheduled_tasks identity columns:', error);
    }
  }

  // {标记} P1-BUG-FIX: 用户记忆身份隔离迁移
  private migrateUserMemoriesAddIdentityColumns(): void {
    try {
      // Check if table exists
      const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='user_memories'");
      if (!tableCheck.length || !tableCheck[0].values.length) {
        return; // Table doesn't exist yet
      }

      // Get current columns
      const pragma = this.db.exec('PRAGMA table_info(user_memories)');
      const columns = pragma[0]?.values.map((row) => (row[1] as string).toLowerCase()) || [];

      // Add agent_role_key column if missing
      if (!columns.includes('agent_role_key')) {
        console.log('[SQLite] Adding agent_role_key column to user_memories');
        this.db.run("ALTER TABLE user_memories ADD COLUMN agent_role_key TEXT DEFAULT 'organizer'");
        this.save();
      }

      // Add model_id column if missing
      if (!columns.includes('model_id')) {
        console.log('[SQLite] Adding model_id column to user_memories');
        this.db.run("ALTER TABLE user_memories ADD COLUMN model_id TEXT DEFAULT ''");
        this.save();
      }
    } catch (error) {
      console.warn('[SQLite] Failed to migrate user_memories identity columns:', error);
    }
  }

  // {标记} P1-技能隔离：创建角色技能配置表迁移
  private migrateCreateSkillRoleConfigs(): void {
    try {
      // Check if table exists
      const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='skill_role_configs'");
      if (tableCheck.length && tableCheck[0].values.length) {
        console.log('[SQLite] skill_role_configs table already exists');
        return;
      }

      // Create table
      console.log('[SQLite] Creating skill_role_configs table');
      this.db.run(`
        CREATE TABLE IF NOT EXISTS skill_role_configs (
          id TEXT PRIMARY KEY,
          role_key TEXT NOT NULL,
          skill_id TEXT NOT NULL,
          skill_name TEXT NOT NULL DEFAULT '',
          prefix TEXT NOT NULL DEFAULT 'public_',
          enabled INTEGER NOT NULL DEFAULT 1,
          config_json TEXT NOT NULL DEFAULT '{}',
          installed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(role_key, skill_id)
        )
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_skill_role_configs_role
        ON skill_role_configs(role_key, enabled)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_skill_role_configs_skill
        ON skill_role_configs(skill_id, role_key)
      `);

      this.save();
      console.log('[SQLite] skill_role_configs table created successfully');
    } catch (error) {
      console.warn('[SQLite] Failed to create skill_role_configs table:', error);
    }
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  onDidChange<T = unknown>(key: string, callback: (newValue: T | undefined, oldValue: T | undefined) => void) {
    const handler = (payload: ChangePayload<T>) => {
      if (payload.key !== key) return;
      callback(payload.newValue, payload.oldValue);
    };
    this.emitter.on('change', handler);
    return () => this.emitter.off('change', handler);
  }

  get<T = unknown>(key: string): T | undefined {
    const result = this.db.exec('SELECT value FROM kv WHERE key = ?', [key]);
    if (!result[0]?.values[0]) return undefined;
    const value = result[0].values[0][0] as string;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`Failed to parse store value for ${key}`, error);
      return undefined;
    }
  }

  set<T = unknown>(key: string, value: T): void {
    const oldValue = this.get<T>(key);
    const now = Date.now();
    this.db.run(`
      INSERT INTO kv (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `, [key, JSON.stringify(value), now]);
    this.save();
    this.emitter.emit('change', { key, newValue: value, oldValue } as ChangePayload<T>);
  }

  delete(key: string): void {
    const oldValue = this.get(key);
    this.db.run('DELETE FROM kv WHERE key = ?', [key]);
    this.save();
    this.emitter.emit('change', { key, newValue: undefined, oldValue } as ChangePayload);
  }

  // Expose database for cowork operations
  getDatabase(): Database {
    return this.db;
  }

  // Expose save method for external use (e.g., CoworkStore)
  getSaveFunction(): () => void {
    return () => this.save();
  }

  private tryReadLegacyMemoryText(): string {
    const candidates = [
      path.join(getProjectRoot(), 'MEMORY.md'),
      getRuntimeAppPath('MEMORY.md'),
      path.join(getProjectRoot(), 'memory.md'),
      getRuntimeAppPath('memory.md'),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return fs.readFileSync(candidate, 'utf8');
        }
      } catch {
        // Skip unreadable candidates.
      }
    }
    return '';
  }

  private parseLegacyMemoryEntries(raw: string): string[] {
    const normalized = raw.replace(/```[\s\S]*?```/g, ' ');
    const lines = normalized.split(/\r?\n/);
    const entries: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const match = line.trim().match(/^-+\s*(?:\[[^\]]+\]\s*)?(.+)$/);
      if (!match?.[1]) continue;
      const text = match[1].replace(/\s+/g, ' ').trim();
      if (!text || text.length < 6) continue;
      if (/^\(empty\)$/i.test(text)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(text.length > 360 ? `${text.slice(0, 359)}…` : text);
    }

    return entries.slice(0, 200);
  }

  private memoryFingerprint(text: string): string {
    const normalized = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return crypto.createHash('sha1').update(normalized).digest('hex');
  }

  private migrateLegacyMemoryFileToUserMemories(): void {
    if (this.get<string>(USER_MEMORIES_MIGRATION_KEY) === '1') {
      return;
    }

    const content = this.tryReadLegacyMemoryText();
    if (!content.trim()) {
      this.set(USER_MEMORIES_MIGRATION_KEY, '1');
      return;
    }

    const entries = this.parseLegacyMemoryEntries(content);
    if (entries.length === 0) {
      this.set(USER_MEMORIES_MIGRATION_KEY, '1');
      return;
    }

    const now = Date.now();
    this.db.run('BEGIN TRANSACTION;');
    try {
      for (const text of entries) {
        const fingerprint = this.memoryFingerprint(text);
        const existing = this.db.exec(
          `SELECT id FROM user_memories WHERE fingerprint = ? AND status != 'deleted' LIMIT 1`,
          [fingerprint]
        );
        if (existing[0]?.values?.[0]?.[0]) {
          continue;
        }

        const memoryId = crypto.randomUUID();
        this.db.run(`
          INSERT INTO user_memories (
            id, text, fingerprint, confidence, is_explicit, status, created_at, updated_at, last_used_at
          ) VALUES (?, ?, ?, ?, 1, 'created', ?, ?, NULL)
        `, [memoryId, text, fingerprint, 0.9, now, now]);

        this.db.run(`
          INSERT INTO user_memory_sources (id, memory_id, session_id, message_id, role, is_active, created_at, agent_role_key, model_id)
          VALUES (?, ?, NULL, NULL, 'system', 1, ?, ?, ?)
        `, [crypto.randomUUID(), memoryId, now, 'organizer', '']);
      }

      this.db.run('COMMIT;');
    } catch (error) {
      this.db.run('ROLLBACK;');
      console.warn('Failed to migrate legacy MEMORY.md entries:', error);
    }

    this.set(USER_MEMORIES_MIGRATION_KEY, '1');
  }

  private migrateFromElectronStore(userDataPath: string) {
    const result = this.db.exec('SELECT COUNT(*) as count FROM kv');
    const count = result[0]?.values[0]?.[0] as number;
    if (count > 0) return;

    const legacyPath = path.join(userDataPath, 'config.json');
    if (!fs.existsSync(legacyPath)) return;

    try {
      const raw = fs.readFileSync(legacyPath, 'utf8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (!data || typeof data !== 'object') return;

      const entries = Object.entries(data);
      if (!entries.length) return;

      const now = Date.now();
      this.db.run('BEGIN TRANSACTION;');
      try {
        entries.forEach(([key, value]) => {
          this.db.run(`
            INSERT INTO kv (key, value, updated_at)
            VALUES (?, ?, ?)
          `, [key, JSON.stringify(value), now]);
        });
        this.db.run('COMMIT;');
        this.save();
        console.info(`Migrated ${entries.length} entries from electron-store.`);
      } catch (error) {
        this.db.run('ROLLBACK;');
        throw error;
      }
    } catch (error) {
      console.warn('Failed to migrate electron-store data:', error);
    }
  }
}
