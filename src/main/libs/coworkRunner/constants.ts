/**
 * Cowork Runner 常量配置
 * 
 * FLOW: 常量配置 步骤1: 定义所有会话运行时的配置常量
 * 
 * @module coworkRunner/constants
 */

/**
 * 本地历史记录限制
 */
export const LOCAL_HISTORY_MAX_MESSAGES = 24;
export const LOCAL_HISTORY_MAX_TOTAL_CHARS = 32000;
export const LOCAL_HISTORY_MAX_MESSAGE_CHARS = 4000;

/**
 * 流式传输限制
 */
export const STREAM_UPDATE_THROTTLE_MS = 90;
export const STREAMING_TEXT_MAX_CHARS = 120_000;
export const STREAMING_THINKING_MAX_CHARS = 60_000;

/**
 * 工具输出限制
 */
export const TOOL_RESULT_MAX_CHARS = 120_000;
export const FINAL_RESULT_MAX_CHARS = 120_000;
export const STDERR_TAIL_MAX_CHARS = 24_000;

/**
 * SDK 启动超时
 */
export const SDK_STARTUP_TIMEOUT_MS = 600_000;
export const SDK_STARTUP_TIMEOUT_WITH_USER_MCP_MS = 600_000;

/**
 * 工具输入预览限制
 */
export const TOOL_INPUT_PREVIEW_MAX_CHARS = 4000;
export const TOOL_INPUT_PREVIEW_MAX_DEPTH = 5;
export const TOOL_INPUT_PREVIEW_MAX_KEYS = 60;
export const TOOL_INPUT_PREVIEW_MAX_ITEMS = 30;

/**
 * 截断提示
 */
export const CONTENT_TRUNCATED_HINT = '\n...[truncated to prevent memory pressure]';

/**
 * 文件识别相关
 */
export const ATTACHMENT_LINE_RE = /^\s*(?:[-*]\s*)?(输入文件|input\s*file)\s*[:：]\s*(.+?)\s*$/i;
export const INFERRED_FILE_REFERENCE_RE = /([^"]+[A-Za-z][A-Za-z0-9]{0,7})/g;
export const INFERRED_FILE_SEARCH_IGNORE = new Set(['.git', 'node_modules', '.cowork-temp', '.idea', '.vscode']);
export const SKILLS_MARKER = '/skills/';

/**
 * 任务工作区
 */
export const TASK_WORKSPACE_CONTAINER_DIR = '.uclaw-tasks';

/**
 * 权限相关
 */
export const PERMISSION_RESPONSE_TIMEOUT_MS = 60_000;
export const DELETE_TOOL_NAMES = new Set(['delete', 'remove', 'unlink', 'rmdir']);
export const SAFETY_APPROVAL_ALLOW_OPTION = '允许本次操作';
export const SAFETY_APPROVAL_DENY_OPTION = '拒绝本次操作';

/**
 * 危险命令正则
 */
export const DELETE_COMMAND_RE = /\b(rm|rmdir|unlink|del|erase|remove-item)\b/i;
export const FIND_DELETE_COMMAND_RE = /\bfind\b[\s\S]*\s-delete\b/i;
export const GIT_CLEAN_COMMAND_RE = /\bgit\s+clean\b/i;
export const PYTHON_BASH_COMMAND_RE = /(?:^|[\w.-])(?:python(?:3)?|py(?:\.exe)?|pip(?:3)?)(?:\s+-3)?(?:\s|$)|\.py(?:\s|$)/i;
export const PYTHON_PIP_BASH_COMMAND_RE = /(?:^|[\w.-])(?:pip(?:3)?|python(?:3)?\s+-m\s+pip|py(?:\.exe)?\s+-m\s+pip)(?:\s|$)/i;

/**
 * 记忆提取相关
 */
export const MEMORY_REQUEST_TAIL_SPLIT_RE = /[,，。]\s*(?:请|麻烦)?你(?:帮我|帮忙|给我|为我|看下|看一下|查下|查一下)|[,，。]\s*帮我|[,，。]\s*请帮我|[,，。]\s*(?:能|可以)?不能?\s*帮我|[,，。]\s*你看|[,，。]\s*请你/i;
export const MEMORY_PROCEDURAL_TEXT_RE = /(执行以下命令|run\s+(?:the\s+)?following\s+command|\b(?:cd|npm|pnpm|yarn|node|python|bash|sh|git|curl|wget)\b|\$[A-Z_][A-Z0-9_]*|&&|--[a-z0-9-]+|\/tmp\/|\.sh\b|\.bat\b|\.ps1\b)/i;
export const MEMORY_ASSISTANT_STYLE_TEXT_RE = /^(?:使用|use)\s+[A-Za-z0-9._-]+\s*(?:技能|skill)/i;

/**
 * Windows 进程隐藏
 */
export const WINDOWS_HIDE_INIT_SCRIPT_NAME = 'windows_hide_init.cjs';
export const WINDOWS_HIDE_INIT_SCRIPT_CONTENT = `use strict;

if (process.platform === 'win32') {
  const childProcess = require('child_process');

  const addWindowsHide = (options) => {
    if (options == null) return { windowsHide: true };
    if (typeof options !== 'object') return options;
    if (Object.prototype.hasOwnProperty.call(options, 'windowsHide')) return options;
    return { ...options, windowsHide: true };
  };

  const patch = (name, buildWrapper) => {
    const original = childProcess[name];
    if (typeof original !== 'function') return;
    childProcess[name] = buildWrapper(original);
  };

  patch('spawn', (original) => function patchedSpawn(command, args, options) {
    if (Array.isArray(args) || args === undefined) {
      return original.call(this, command, args, addWindowsHide(options));
    }
    return original.call(this, command, addWindowsHide(args));
  });

  patch('spawnSync', (original) => function patchedSpawnSync(command, args, options) {
    if (Array.isArray(args) || args === undefined) {
      return original.call(this, command, args, addWindowsHide(options));
    }
    return original.call(this, command, addWindowsHide(args));
  });

  patch('fork', (original) => function patchedFork(modulePath, args, options) {
    return original.call(this, modulePath, args, addWindowsHide(options));
  });
}`;

/**
 * 致命错误模式
 */
export const STDERR_FATAL_PATTERNS = [
  /authentication[_ ]error/i,
  /invalid[_ ]api[_ ]key/i,
  /unauthorized/i,
  /model[_ ]not[_ ]found/i,
  /connection[_ ]refused/i,
  /ECONNREFUSED/,
  /could not connect/i,
  /api[_ ]key[_ ]not[_ ]valid/i,
  /permission[_ ]denied/i,
  /access[_ ]denied/i,
  /rate[_ ]limit/i,
  /quota[_ ]exceeded/i,
  /billing/i,
  /overloaded/i,
];

/**
 * 沙箱兼容常量（清理后保留）
 */
export const SKILLS_MOUNT_TAG = 'mount_';
export const SKILLS_GUEST_PATH_WINDOWS = 'C:\\tmp';
export const SKILLS_GUEST_PATH = '/tmp';
export const ALLOWED_ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP'];
export const ATTACHMENT_DIR = '.attachments';
export const WORKSPACE_GUEST_ROOT = '/workspace';
export const WORKSPACE_LEGACY_ROOT = '/workspace';
export const HISTORY_MAX_MESSAGE_CHARS = 4000;
export const HISTORY_MAX_MESSAGES = 24;
export const HISTORY_MAX_TOTAL_CHARS = 32000;

/**
 * LEGACY兼容常量（清理后保留）
 */
export const LEGACY_SKILLS_ROOT_HINTS = ['.skills', 'skills'];

/**
 * 沙箱错误格式化函数（清理后保留）
 */
export function formatSandboxSpawnError(error: any, runtimeInfo: any): string {
  return `Sandbox spawn error: ${error.message || error}`;
}
