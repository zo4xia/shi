/**
 * {祖传勿改} Skill Role Configs API - 技能身份绑定核心
 * {标记} P1-技能隔离：角色技能配置 API
 * {标记} 功能：管理每个角色的技能配置
 * {标记} 用途：支持按角色安装/启用/配置技能
 * {验证} 2026-03-17 复查：技能隔离核心，支持全局/角色绑定 ✅
 * {警告} 修改此文件会影响所有技能的身份绑定和加载逻辑
 */

import fs from 'fs';
import { Router, Request, Response } from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { RequestContext } from '../src/index';
import {
  ensureRoleRuntimeDirs,
  getRoleSkillConfigPath,
  getRoleSkillSecretPath,
  getRoleSkillsIndexPath,
  syncRoleSkillIndexes,
} from '../libs/roleSkillFiles';
import { syncRoleCapabilitySnapshots } from '../libs/roleRuntimeViews';
import { broadcastToAll } from '../websocket';

export interface SkillRoleConfig {
  id: string;
  roleKey: string;
  skillId: string;
  skillName: string;
  prefix: string;
  enabled: boolean;
  config: Record<string, unknown>;
  installedAt: number;
  updatedAt: number;
}

export interface SkillRoleConfigInput {
  roleKey: string;
  skillId: string;
  skillName: string;
  prefix?: string;
  config?: Record<string, unknown>;
}

export function setupSkillRoleConfigRoutes(app: Router) {
  const router = Router();
  const validRoleKeys = ['organizer', 'writer', 'designer', 'analyst'] as const;

  function syncRoleIndexes(req: Request): void {
    // {路标} FLOW-SKILL-BINDING-SYNC
    // {FLOW} SKILL-BINDING-SIDE-EFFECT: 角色绑定层的增删改，不只写 DB，还会回写角色运行态文件与 capability snapshot。
    const userDataPath = String(req.app.get('userDataPath') || '');
    if (!userDataPath) return;
    const { store, skillManager, mcpStore } = req.context as RequestContext;
    ensureRoleRuntimeDirs(userDataPath);
    syncRoleSkillIndexes(userDataPath, store, skillManager);
    syncRoleCapabilitySnapshots(userDataPath, store, skillManager, mcpStore);
  }

  function emitSkillsChanged(reason: string): void {
    broadcastToAll({
      type: 'skills:changed',
      data: { reason },
    });
  }

  function parseRoleKey(roleKey: string): typeof validRoleKeys[number] | null {
    return validRoleKeys.includes(roleKey as typeof validRoleKeys[number])
      ? (roleKey as typeof validRoleKeys[number])
      : null;
  }

  function isPlainRecord(value: unknown): value is Record<string, string> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function hasRoleSkillBinding(req: Request, roleKey: typeof validRoleKeys[number], skillId: string): boolean {
    const { store } = req.context as RequestContext;
    const db = store.getDatabase();
    const result = db.exec(
      `SELECT id
       FROM skill_role_configs
       WHERE enabled = 1
         AND skill_id = ?
         AND role_key IN (?, 'all')
       LIMIT 1`,
      [skillId, roleKey]
    );
    return result.length > 0 && result[0].values.length > 0;
  }

  function readJsonFile(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      throw new Error('Config file must be a plain object');
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')])
    );
  }

  function writeJsonFile(filePath: string, payload: Record<string, string>): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  /**
   * {标记} GET /api/skill-role-configs
   * 获取指定角色的技能配置列表
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.get('/', (req: Request, res: Response) => {
    try {
      syncRoleIndexes(req);
      const { store } = req.context as RequestContext;
      const { roleKey, enabled } = req.query;

      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: 'roleKey is required',
        });
      }

      const db = store.getDatabase();
      const clauses: string[] = ['role_key = ?'];
      const params: Array<string | number> = [roleKey as string];

      if (enabled !== undefined) {
        clauses.push('enabled = ?');
        params.push(enabled === 'true' ? 1 : 0);
      }

      const whereClause = clauses.join(' AND ');
      const sql = `
        SELECT id, role_key, skill_id, skill_name, prefix, enabled,
               config_json, installed_at, updated_at
        FROM skill_role_configs
        WHERE ${whereClause}
        ORDER BY installed_at DESC
      `;

      const result = db.exec(sql, params);
      const configs: SkillRoleConfig[] = result.length > 0 && result[0].values.length > 0
        ? result[0].values.map((row) => ({
            id: row[0] as string,
            roleKey: row[1] as string,
            skillId: row[2] as string,
            skillName: row[3] as string,
            prefix: row[4] as string,
            enabled: (row[5] as number) === 1,
            config: JSON.parse(row[6] as string),
            installedAt: row[7] as number,
            updatedAt: row[8] as number,
          }))
        : [];

      res.json({
        success: true,
        configs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * {标记} GET /api/skill-role-configs/all
   * 获取所有角色的技能配置（用于管理界面）
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.get('/all', (req: Request, res: Response) => {
    try {
      syncRoleIndexes(req);
      const { store } = req.context as RequestContext;
      const db = store.getDatabase();

      const sql = `
        SELECT id, role_key, skill_id, skill_name, prefix, enabled,
               config_json, installed_at, updated_at
        FROM skill_role_configs
        ORDER BY role_key, installed_at DESC
      `;

      const result = db.exec(sql);
      const configs: SkillRoleConfig[] = result.length > 0 && result[0].values.length > 0
        ? result[0].values.map((row) => ({
            id: row[0] as string,
            roleKey: row[1] as string,
            skillId: row[2] as string,
            skillName: row[3] as string,
            prefix: row[4] as string,
            enabled: (row[5] as number) === 1,
            config: JSON.parse(row[6] as string),
            installedAt: row[7] as number,
            updatedAt: row[8] as number,
          }))
        : [];

      res.json({
        success: true,
        configs,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.get('/index/:roleKey', (req: Request, res: Response) => {
    try {
      const roleKey = parseRoleKey(req.params.roleKey);
      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${validRoleKeys.join(', ')}`,
        });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      ensureRoleRuntimeDirs(userDataPath);
      syncRoleIndexes(req);
      const filePath = getRoleSkillsIndexPath(userDataPath, roleKey);
      const raw = fs.readFileSync(filePath, 'utf8');
      res.json({
        success: true,
        path: filePath,
        index: JSON.parse(raw),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.get('/:roleKey/skills/:skillId/config', (req: Request, res: Response) => {
    try {
      const roleKey = parseRoleKey(req.params.roleKey);
      const skillId = String(req.params.skillId || '').trim();
      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${validRoleKeys.join(', ')}`,
        });
      }
      if (!skillId) {
        return res.status(400).json({
          success: false,
          error: 'skillId is required',
        });
      }
      if (!hasRoleSkillBinding(req, roleKey, skillId)) {
        return res.status(404).json({
          success: false,
          error: 'Skill is not bound to this role',
        });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      ensureRoleRuntimeDirs(userDataPath);
      const filePath = getRoleSkillConfigPath(userDataPath, roleKey, skillId);
      const config = readJsonFile(filePath);
      res.json({ success: true, path: filePath, config });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.put('/:roleKey/skills/:skillId/config', (req: Request, res: Response) => {
    try {
      const roleKey = parseRoleKey(req.params.roleKey);
      const skillId = String(req.params.skillId || '').trim();
      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${validRoleKeys.join(', ')}`,
        });
      }
      if (!skillId) {
        return res.status(400).json({
          success: false,
          error: 'skillId is required',
        });
      }
      if (!hasRoleSkillBinding(req, roleKey, skillId)) {
        return res.status(404).json({
          success: false,
          error: 'Skill is not bound to this role',
        });
      }
      if (!isPlainRecord(req.body)) {
        return res.status(400).json({
          success: false,
          error: 'Config body must be a plain object',
        });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      ensureRoleRuntimeDirs(userDataPath);
      const filePath = getRoleSkillConfigPath(userDataPath, roleKey, skillId);
      const config = Object.fromEntries(
        Object.entries(req.body).map(([key, value]) => [key, String(value ?? '')])
      );
      writeJsonFile(filePath, config);
      syncRoleIndexes(req);
      res.json({ success: true, path: filePath });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.get('/:roleKey/skills/:skillId/secret-meta', (req: Request, res: Response) => {
    try {
      const roleKey = parseRoleKey(req.params.roleKey);
      const skillId = String(req.params.skillId || '').trim();
      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${validRoleKeys.join(', ')}`,
        });
      }
      if (!skillId) {
        return res.status(400).json({
          success: false,
          error: 'skillId is required',
        });
      }
      if (!hasRoleSkillBinding(req, roleKey, skillId)) {
        return res.status(404).json({
          success: false,
          error: 'Skill is not bound to this role',
        });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      ensureRoleRuntimeDirs(userDataPath);
      const filePath = getRoleSkillSecretPath(userDataPath, roleKey, skillId);
      const config = readJsonFile(filePath);
      res.json({
        success: true,
        path: filePath,
        fields: Object.keys(config),
        hasSecrets: Object.keys(config).length > 0,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.put('/:roleKey/skills/:skillId/secrets', (req: Request, res: Response) => {
    try {
      const roleKey = parseRoleKey(req.params.roleKey);
      const skillId = String(req.params.skillId || '').trim();
      if (!roleKey) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${validRoleKeys.join(', ')}`,
        });
      }
      if (!skillId) {
        return res.status(400).json({
          success: false,
          error: 'skillId is required',
        });
      }
      if (!hasRoleSkillBinding(req, roleKey, skillId)) {
        return res.status(404).json({
          success: false,
          error: 'Skill is not bound to this role',
        });
      }
      if (!isPlainRecord(req.body)) {
        return res.status(400).json({
          success: false,
          error: 'Secrets body must be a plain object',
        });
      }

      const userDataPath = String(req.app.get('userDataPath') || '');
      ensureRoleRuntimeDirs(userDataPath);
      const filePath = getRoleSkillSecretPath(userDataPath, roleKey, skillId);
      const secrets = Object.fromEntries(
        Object.entries(req.body).map(([key, value]) => [key, String(value ?? '')])
      );
      writeJsonFile(filePath, secrets);
      syncRoleIndexes(req);
      res.json({
        success: true,
        path: filePath,
        fields: Object.keys(secrets),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * {标记} POST /api/skill-role-configs
   * 安装技能到指定角色
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const input: SkillRoleConfigInput = req.body;

      if (!input.roleKey || !input.skillId || !input.skillName) {
        return res.status(400).json({
          success: false,
          error: 'roleKey, skillId, and skillName are required',
        });
      }

      // 验证 roleKey
      const allValidRoleKeys = [...validRoleKeys, 'all'];
      if (!allValidRoleKeys.includes(input.roleKey as typeof allValidRoleKeys[number])) {
        return res.status(400).json({
          success: false,
          error: `Invalid roleKey. Must be one of: ${allValidRoleKeys.join(', ')}`,
        });
      }

      // 确定前缀
      const prefix = input.prefix || (input.roleKey === 'all' ? 'public_' : `${input.roleKey}_`);

      const db = store.getDatabase();
      const now = Date.now();
      const id = uuidv4();

      // 检查是否已存在
      const existing = db.exec(
        'SELECT id FROM skill_role_configs WHERE role_key = ? AND skill_id = ?',
        [input.roleKey, input.skillId]
      );

      if (existing.length > 0 && existing[0].values.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Skill already installed for this role',
        });
      }

      // 插入新记录
      const sql = `
        INSERT INTO skill_role_configs
        (id, role_key, skill_id, skill_name, prefix, enabled, config_json, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `;

      db.run(sql, [
        id,
        input.roleKey,
        input.skillId,
        input.skillName,
        prefix,
        JSON.stringify(input.config || {}),
        now,
        now,
      ]);
      store.getSaveFunction()();

      // {业务走线} P0-技能隔离：立即下载技能文件
      let downloadResult: { success: boolean; error?: string } = { success: true };
      try {
        const { skillManager } = req.context as RequestContext;
        const alreadyInstalled = skillManager?.listSkills?.().some((skill) => (
          skill.id === input.skillId || skill.name === input.skillName
        ));
        if (!alreadyInstalled && skillManager && typeof skillManager.downloadSkill === 'function') {
          // {业务走线} 从内置源下载技能（web-search等内置技能）
          downloadResult = await skillManager.downloadSkill(input.skillId);
          if (!downloadResult.success && downloadResult.error) {
            console.warn(`[SkillInstall] Failed to download skill ${input.skillId}: ${downloadResult.error}`);
          }
        }
      } catch (downloadError) {
        console.error(`[SkillInstall] Download error for skill ${input.skillId}:`, downloadError);
        downloadResult = { 
          success: false, 
          error: downloadError instanceof Error ? downloadError.message : String(downloadError) 
        };
      }

      syncRoleIndexes(req);
      emitSkillsChanged('role-bindings-created');
      res.json({
        success: true,
        config: {
          id,
          roleKey: input.roleKey,
          skillId: input.skillId,
          skillName: input.skillName,
          prefix,
          enabled: true,
          config: input.config || {},
          installedAt: now,
          updatedAt: now,
        } as SkillRoleConfig,
        download: downloadResult,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * {标记} PUT /api/skill-role-configs/:id
   * 更新角色技能配置
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const { id } = req.params;
      const updates: Partial<SkillRoleConfigInput> & { enabled?: boolean } = req.body;

      const db = store.getDatabase();
      const now = Date.now();

      // 检查是否存在
      const existing = db.exec('SELECT id FROM skill_role_configs WHERE id = ?', [id]);
      if (existing.length === 0 || existing[0].values.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Config not found',
        });
      }

      // 构建更新 SQL
      const updateFields: string[] = [];
      const updateParams: Array<string | number | object> = [];

      if (updates.skillName !== undefined) {
        updateFields.push('skill_name = ?');
        updateParams.push(updates.skillName);
      }

      if (updates.prefix !== undefined) {
        updateFields.push('prefix = ?');
        updateParams.push(updates.prefix);
      }

      if (updates.enabled !== undefined) {
        updateFields.push('enabled = ?');
        updateParams.push(updates.enabled ? 1 : 0);
      }

      if (updates.config !== undefined) {
        updateFields.push('config_json = ?');
        updateParams.push(JSON.stringify(updates.config));
      }

      updateFields.push('updated_at = ?');
      updateParams.push(now);
      updateParams.push(id);

      const sql = `
        UPDATE skill_role_configs
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      // 类型转换：将 object 转为 string
      const finalParams = updateParams.map(p => typeof p === 'object' ? JSON.stringify(p) : p) as Array<string | number>;
      db.run(sql, finalParams);
      store.getSaveFunction()();

      syncRoleIndexes(req);
      emitSkillsChanged('role-bindings-updated');
      res.json({
        success: true,
        message: 'Config updated',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * {标记} DELETE /api/skill-role-configs/:id
   * 卸载角色技能
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const { id } = req.params;

      const db = store.getDatabase();
      db.run('DELETE FROM skill_role_configs WHERE id = ?', [id]);
      store.getSaveFunction()();

      syncRoleIndexes(req);
      emitSkillsChanged('role-bindings-deleted');
      res.json({
        success: true,
        message: 'Config deleted',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * {标记} POST /api/skill-role-configs/batch-install
   * 批量安装技能到多个角色
   */
  // {路标} FLOW-ROUTE-SKILL-ROLE-CONFIGS
  router.post('/batch-install', (req: Request, res: Response) => {
    try {
      const { store } = req.context as RequestContext;
      const { skillId, skillName, roleKeys, config } = req.body;

      if (!skillId || !skillName || !roleKeys || !Array.isArray(roleKeys)) {
        return res.status(400).json({
          success: false,
          error: 'skillId, skillName, and roleKeys (array) are required',
        });
      }

      const db = store.getDatabase();
      const now = Date.now();
      const results: SkillRoleConfig[] = [];

      for (const roleKey of roleKeys) {
        const allValidRoleKeys = [...validRoleKeys, 'all'];
        if (!allValidRoleKeys.includes(roleKey)) {
          continue;
        }

        const id = uuidv4();
        const prefix = roleKey === 'all' ? 'public_' : `${roleKey}_`;

        try {
          db.run(
            `INSERT INTO skill_role_configs
            (id, role_key, skill_id, skill_name, prefix, enabled, config_json, installed_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            [
              id,
              roleKey,
              skillId,
              skillName,
              prefix,
              JSON.stringify(config || {}),
              now,
              now,
            ]
          );

          results.push({
            id,
            roleKey,
            skillId,
            skillName,
            prefix,
            enabled: true,
            config: config || {},
            installedAt: now,
            updatedAt: now,
          } as SkillRoleConfig);
        } catch (err) {
          // Skip if already exists
          console.warn(`Skill ${skillId} already installed for ${roleKey}`);
        }
      }

      store.getSaveFunction()();

      syncRoleIndexes(req);
      emitSkillsChanged('role-bindings-batch-installed');
      res.json({
        success: true,
        configs: results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // {路标} FLOW-MOUNT-SKILL-ROLE-CONFIGS
  app.use('/api/skill-role-configs', router);
}
