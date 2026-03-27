import crypto from 'crypto';
import { Database } from 'sql.js';
// {标记} P0-工具调用优化：集成 MCP 描述压缩器
import { compactMcpDescription } from './libs/toolUseCompacter';

export interface McpServerRecord {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transportType: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isBuiltIn: boolean;
  githubUrl?: string;
  registryId?: string;
  agentRoleKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface McpServerFormData {
  name: string;
  description: string;
  transportType: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isBuiltIn?: boolean;
  githubUrl?: string;
  registryId?: string;
  agentRoleKey?: string;
}

interface McpServerRow {
  id: string;
  name: string;
  description: string;
  enabled: number;
  transport_type: string;
  config_json: string;
  agent_role_key: string;
  created_at: number;
  updated_at: number;
}

interface McpConfigJson {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  isBuiltIn?: boolean;
  githubUrl?: string;
  registryId?: string;
}

export class McpStore {
  private db: Database;
  private saveDb: () => void;

  constructor(db: Database, saveDb: () => void) {
    this.db = db;
    this.saveDb = saveDb;
  }

  private deserializeRow(values: unknown[]): McpServerRecord {
    const row: McpServerRow = {
      id: values[0] as string,
      name: values[1] as string,
      description: values[2] as string,
      enabled: values[3] as number,
      transport_type: values[4] as string,
      config_json: values[5] as string,
      agent_role_key: (values[6] as string) || 'all',
      created_at: values[7] as number,
      updated_at: values[8] as number,
    };

    let config: McpConfigJson = {};
    try {
      config = JSON.parse(row.config_json) as McpConfigJson;
    } catch {
      // Invalid JSON, use defaults
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled === 1,
      transportType: row.transport_type as 'stdio' | 'sse' | 'http',
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      headers: config.headers,
      isBuiltIn: config.isBuiltIn === true,
      githubUrl: config.githubUrl,
      registryId: config.registryId,
      agentRoleKey: row.agent_role_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeConfig(data: Partial<McpServerFormData>): string {
    const config: McpConfigJson = {};
    if (data.command !== undefined) config.command = data.command;
    if (data.args !== undefined) config.args = data.args;
    if (data.env !== undefined && Object.keys(data.env).length > 0) config.env = data.env;
    if (data.url !== undefined) config.url = data.url;
    if (data.headers !== undefined && Object.keys(data.headers).length > 0) config.headers = data.headers;
    if (data.isBuiltIn) config.isBuiltIn = true;
    if (data.githubUrl) config.githubUrl = data.githubUrl;
    if (data.registryId) config.registryId = data.registryId;
    return JSON.stringify(config);
  }

  listServers(): McpServerRecord[] {
    const result = this.db.exec(
      'SELECT id, name, description, enabled, transport_type, config_json, agent_role_key, created_at, updated_at FROM mcp_servers ORDER BY created_at ASC'
    );
    if (!result[0]) return [];
    return result[0].values.map((row) => this.deserializeRow(row));
  }

  private isLegacyMemoryCompatServer(server: McpServerRecord): boolean {
    return server.registryId === 'memory' || (server.isBuiltIn && server.name === 'Memory');
  }

  getServer(id: string): McpServerRecord | null {
    const result = this.db.exec(
      'SELECT id, name, description, enabled, transport_type, config_json, agent_role_key, created_at, updated_at FROM mcp_servers WHERE id = ?',
      [id]
    );
    if (!result[0]?.values[0]) return null;
    return this.deserializeRow(result[0].values[0]);
  }

  createServer(data: McpServerFormData): McpServerRecord {
    const id = crypto.randomUUID();
    const now = Date.now();
    const configJson = this.serializeConfig(data);
    const agentRoleKey = data.agentRoleKey || 'all';

    this.db.run(
      `INSERT INTO mcp_servers (id, name, description, enabled, transport_type, config_json, agent_role_key, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [id, data.name, data.description, data.transportType, configJson, agentRoleKey, now, now]
    );
    this.saveDb();

    return this.getServer(id)!;
  }

  updateServer(id: string, data: Partial<McpServerFormData>): McpServerRecord | null {
    const existing = this.getServer(id);
    if (!existing) return null;

    const now = Date.now();
    const merged: McpServerFormData = {
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      transportType: data.transportType ?? existing.transportType,
      command: data.command !== undefined ? data.command : existing.command,
      args: data.args !== undefined ? data.args : existing.args,
      env: data.env !== undefined ? data.env : existing.env,
      url: data.url !== undefined ? data.url : existing.url,
      headers: data.headers !== undefined ? data.headers : existing.headers,
      isBuiltIn: data.isBuiltIn !== undefined ? data.isBuiltIn : existing.isBuiltIn,
      githubUrl: data.githubUrl !== undefined ? data.githubUrl : existing.githubUrl,
      registryId: data.registryId !== undefined ? data.registryId : existing.registryId,
      agentRoleKey: data.agentRoleKey !== undefined ? data.agentRoleKey : existing.agentRoleKey,
    };

    const configJson = this.serializeConfig(merged);

    this.db.run(
      `UPDATE mcp_servers SET name = ?, description = ?, transport_type = ?, config_json = ?, agent_role_key = ?, updated_at = ? WHERE id = ?`,
      [merged.name, merged.description, merged.transportType, configJson, merged.agentRoleKey || 'all', now, id]
    );
    this.saveDb();

    return this.getServer(id);
  }

  deleteServer(id: string): boolean {
    const existing = this.getServer(id);
    if (!existing) return false;

    this.db.run('DELETE FROM mcp_servers WHERE id = ?', [id]);
    this.saveDb();
    return true;
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const existing = this.getServer(id);
    if (!existing) return false;

    const now = Date.now();
    this.db.run(
      'UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?',
      [enabled ? 1 : 0, now, id]
    );
    this.saveDb();
    return true;
  }

  /**
   * {祖传勿改} Get enabled MCP servers filtered by agent role
   * {标记} 功能：按身份过滤 MCP 服务器
   * {标记} 用途：实现 MCP 工具的身份隔离（organizer 专用 Playwright 等）
   * {验证} 2026-03-17 复查：核心 MCP 加载逻辑，CoworkRunner 依赖此方法 ✅
   * {警告} 修改此方法会影响所有身份的工具可用性，必须测试各身份的 MCP 加载
   */
  getEnabledServers(agentRoleKey?: string): McpServerRecord[] {
    const result = this.db.exec(
      'SELECT id, name, description, enabled, transport_type, config_json, agent_role_key, created_at, updated_at FROM mcp_servers WHERE enabled = 1 ORDER BY created_at ASC'
    );
    if (!result[0]) return [];
    const all = result[0].values.map((row) => this.deserializeRow(row));
    if (!agentRoleKey) return all;
    // 按身份过滤：返回绑定到该角色或绑定到'all'的 MCP 服务器
    return all.filter(s => s.agentRoleKey === 'all' || s.agentRoleKey === agentRoleKey);
  }

  /**
   * {标记} P0-MCP-MEMORY-DEDUPE
   * 运行态注入时只保留真正参与会话的 MCP。
   * 旧的 Memory 记录仅作兼容保留，不再参与普通会话 / 定时任务注入，
   * 因为 CoworkRunner 会单独注入运行时记忆核心，避免重复挂两套记忆入口。
   */
  getRuntimeEnabledServers(agentRoleKey?: string): McpServerRecord[] {
    // {FLOW} MCP-RUNTIME-TRUTH: 会话实际注入只看这里；它在 getEnabledServers 基础上再排除 legacy Memory compat 记录。
    return this.getEnabledServers(agentRoleKey).filter((server) => !this.isLegacyMemoryCompatServer(server));
  }

  disableLegacyMemoryCompatServers(): number {
    const targets = this.listServers().filter((server) => this.isLegacyMemoryCompatServer(server) && server.enabled);
    for (const server of targets) {
      this.updateServer(server.id, {
        description: '旧 Memory MCP 兼容记录。真实记忆核心由 CoworkRunner 运行时注入；此记录不再参与会话或定时任务工具注入。',
      });
      this.setEnabled(server.id, false);
    }
    return targets.length;
  }

  /**
   * {标记} P0-工具调用优化：获取优化后的 MCP 服务器列表
   * {标记} 功能：按身份过滤 + 压缩描述
   * {标记} 用途：减少 System Prompt 中 MCP 描述的 token 消耗
   * @param agentRoleKey - 身份 Key
   * @returns 优化后的 MCP 服务器列表（description 已压缩）
   */
  getEnabledServersOptimized(agentRoleKey?: string): McpServerRecord[] {
    const servers = this.getEnabledServers(agentRoleKey);
    
    // {标记} P0-工具调用优化：压缩 MCP 描述
    return servers.map(server => ({
      ...server,
      description: compactMcpDescription(server.name, server.description),
    }));
  }
}
