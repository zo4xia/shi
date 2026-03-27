import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const targetRoot = path.join(repoRoot, 'delivery-mainline-1.0-clean');

const rootFiles = [
  '.env.example',
  '.eslintrc.cjs',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'index.html',
  'LICENSE',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.web.ts',
];

const rootDirs = [
  'patches',
  'public',
  'server',
  'SKILLs',
  'src',
];

const scriptFiles = [
  'bind-blingbling-little-eye.ts',
  'bind-ima-skill.ts',
  'dev-runner.mjs',
  'refresh-clean-web-package.mjs',
  'smoke-cowork-session.mjs',
  'sync-app-config-env.ts',
];

const copiedDocFiles = [
  'AGENTS.md',
  'REPAIR_CHECKLIST_2026-03-25_06-07.md',
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFileRelative(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
}

async function copyDirRelative(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter: (source) => {
      const relative = path.relative(repoRoot, source);
      if (!relative) return true;
      const normalized = relative.replaceAll('\\', '/');
      if (normalized === 'server/dist') return false;
      if (normalized.startsWith('server/dist/')) return false;
      if (normalized === 'server/public') return false;
      if (normalized.startsWith('server/public/')) return false;
      if (normalized === 'server/uclaw.sqlite') return false;
      if (normalized.endsWith('.sqlite')) return false;
      if (normalized.endsWith('.db')) return false;
      return true;
    },
  });
}

async function writeTextFile(relativePath, content) {
  const targetPath = path.join(targetRoot, relativePath);
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, `${content.trim()}\n`, 'utf8');
}

const deliveryReadme = `
# UCLAW 1.0 Mainline Clean Web Package

这个目录是当前一期主线的纯净 web 交付包。

## 范围

- 包含：\`Web / Feishu / Scheduler / 记忆链 / 4 固定角色槽位\`
- 排除：\`node_modules / dist / clean-room / .uclaw / release caches / Room 实验线\`

## 当前口径

- 身份唯一真理：\`agentRoleKey\`
- 模型只是运行配置：\`modelId\`
- 一期先保固定四角色：\`organizer / writer / designer / analyst\`
- MCP 一期前端只展示“当前支持 / 可接入”，隐藏未收口的自定义入口
- PDF / Word / 常见附件解析属于系统底层能力，不依赖单独 skill

## 使用

\`\`\`bash
npm ci
npm run dev:web
\`\`\`

生产构建：

\`\`\`bash
npm run build
npm run start
\`\`\`

文档入口：

- \`docs/AGENTS.md\`
- \`docs/MAINLINE_1.0_BOUNDARY.md\`
- \`docs/RUNBOOK_1.0.md\`
- \`docs/PURE_PACKAGE_FILETREE.md\`
- \`docs/REPAIR_CHECKLIST_2026-03-25_06-07.md\`
`;

const boundaryDoc = `
# MAINLINE 1.0 Boundary

## 一期主线

- Web 对话
- Feishu 渠道
- Scheduler 调度
- 按身份隔离的 24h 线程与记忆
- 固定四角色运行配置

## 一期不扩

- Room 实验线
- 自定义 agent 新增能力
- MCP 自定义入口对外暴露
- 把旧重链重新拉回主线

## 铁律

- \`agentRoleKey\` 是唯一身份真理
- \`modelId\` 不是身份键
- \`all\` 只是展示聚合
- 记忆、skills、MCP、线程、任务上下文都只能按身份隔离

## 文档处理口径

- PDF / Word / 常见附件解析属于底层通用能力，不额外包一层 skill
- 当前实现位于 \`server/libs/fileParser.ts\`
- \`SKILLs/\` 里没有同名目录，不代表系统不支持该文档类型
`;

const runbookDoc = `
# RUNBOOK 1.0

## 环境

- Node.js: \`>=20 <25\`
- 推荐版本：\`.nvmrc\` 当前为 \`24\`，但标准部署兼容 Node \`20 / 22 / 24\`
- 首次运行先复制 \`.env.example -> .env\`

## 开发

\`\`\`bash
npm ci
npm run dev:web
\`\`\`

默认会启动：

- backend: \`http://127.0.0.1:3001\` 起自动避让
- frontend: \`http://127.0.0.1:5176\` 起自动避让

## 生产

\`\`\`bash
npm run build
npm run start
\`\`\`

## 飞书一期

最少检查：

- \`UCLAW_FEISHU_APP_ID\`
- \`UCLAW_FEISHU_APP_SECRET\`
- \`UCLAW_FEISHU_AGENT_ROLE_KEY\`

## 文档解析

- PDF / Word / 常见文本附件读取走系统底层解析链
- 不需要单独安装 \`pdf\` / \`word\` skill
- 当前支持：\`pdf / doc / docx / txt / md / csv / json / xml / html / xlsx(基础)\`

## 纯净包刷新

\`\`\`bash
npm run package:web-clean
\`\`\`
`;

const filetreeDoc = `
# Pure Package Filetree

\`\`\`text
delivery-mainline-1.0-clean
├─ README.md
├─ .env.example
├─ package.json
├─ package-lock.json
├─ index.html
├─ vite.config.web.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ tailwind.config.js
├─ postcss.config.js
├─ .eslintrc.cjs
├─ .gitignore
├─ .npmrc
├─ .nvmrc
├─ LICENSE
├─ patches/
├─ public/
├─ scripts/
│  ├─ dev-runner.mjs
│  ├─ sync-app-config-env.ts
│  ├─ smoke-cowork-session.mjs
│  ├─ bind-ima-skill.ts
│  ├─ bind-blingbling-little-eye.ts
│  └─ refresh-clean-web-package.mjs
├─ server/
├─ src/
├─ SKILLs/
└─ docs/
   ├─ AGENTS.md
   ├─ MAINLINE_1.0_BOUNDARY.md
   ├─ PURE_PACKAGE_FILETREE.md
   ├─ RUNBOOK_1.0.md
   └─ REPAIR_CHECKLIST_2026-03-25_06-07.md
\`\`\`
`;

async function main() {
  await fs.rm(targetRoot, { recursive: true, force: true });
  await ensureDir(targetRoot);

  for (const file of rootFiles) {
    await copyFileRelative(file);
  }

  for (const dir of rootDirs) {
    await copyDirRelative(dir);
  }

  await ensureDir(path.join(targetRoot, 'scripts'));
  for (const file of scriptFiles) {
    await copyFileRelative(path.join('scripts', file));
  }

  await ensureDir(path.join(targetRoot, 'docs'));
  for (const file of copiedDocFiles) {
    await copyFileRelative(path.join('docs', file));
  }

  await writeTextFile('README.md', deliveryReadme);
  await writeTextFile(path.join('docs', 'MAINLINE_1.0_BOUNDARY.md'), boundaryDoc);
  await writeTextFile(path.join('docs', 'RUNBOOK_1.0.md'), runbookDoc);
  await writeTextFile(path.join('docs', 'PURE_PACKAGE_FILETREE.md'), filetreeDoc);

  console.log(`[clean-web-package] ready: ${targetRoot}`);
  console.log('[clean-web-package] excludes: node_modules, dist, clean-room, .uclaw, release caches');
}

main().catch((error) => {
  console.error('[clean-web-package] failed:', error);
  process.exitCode = 1;
});
