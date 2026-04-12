import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TARGET_ALIASES = new Map([
  ['linux', 'linux'],
  ['systemd', 'linux'],
  ['render', 'render'],
  ['railway', 'railway'],
  ['zeabur', 'zeabur'],
  ['frontend-static', 'frontend-static'],
  ['vercel-static', 'frontend-static'],
  ['static', 'frontend-static'],
]);

const TARGET_NOTES = {
  linux: {
    title: 'Linux + systemd',
    summary: '传统 Linux / VM / 云主机，直接跑完整 Node 运行时。',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    extraNotes: [
      '建议把仓库部署到 /opt/uclaw，env 放到 /etc/uclaw/uclaw.env。',
      '服务模板直接使用 deploy/linux/uclaw.service。',
      '如需 5176 本地式门面，再启 deploy/linux/uclaw-frontend.service。',
    ],
  },
  render: {
    title: 'Render Web Service',
    summary: '完整 Node 服务托管，适合单体后端+前端静态同机。',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    extraNotes: [
      '服务类型选 Web Service，不要选 Static Site。',
      '持久化磁盘请挂到项目目录内，并让 UCLAW_DATA_PATH 留在项目根内部。',
      '健康检查路径使用 /health。',
    ],
  },
  railway: {
    title: 'Railway',
    summary: '完整 Node 服务托管，平台会注入 PORT。',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    extraNotes: [
      '保留 PORT 交给平台注入即可，不要手改成固定值。',
      '如果要持久化数据，请确认挂载路径仍在项目根目录内部。',
      '建议把 CORS_ORIGIN 设成最终公网域名，不要再保留 *。',
    ],
  },
  zeabur: {
    title: 'Zeabur Node Service',
    summary: '完整 Node 服务托管，但必须按 Node 服务，不是静态站点。',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    extraNotes: [
      '不要把项目误判成静态站点，不要配置 dist 作为输出目录。',
      'zbpack.json 已固定 build/start 命令，部署时沿用即可。',
      '如果历史上配过 ZBPACK_OUTPUT_DIR=dist，请删掉后重建服务。',
    ],
  },
  'frontend-static': {
    title: 'Static Frontend (Vercel / Netlify / Cloudflare Pages)',
    summary: '只部署前端壳，后端另放 Render / Zeabur / Linux / Railway。',
    buildCommand: 'npm run build:web',
    startCommand: '静态托管，无 Node 长驻进程',
    extraNotes: [
      '仓库根的 vercel.json 仍会阻止“完整运行时”误投到 Vercel，这个限制不变。',
      '这一目标只负责生成静态前端构建期变量，后端必须单独部署。',
      '推荐最少只填 VITE_BACKEND_ORIGIN，前端会自动推导 /api 和 /ws。',
    ],
  },
};

function printUsage() {
  console.log(`Usage:
  npm run deploy:init -- --target <linux|render|railway|zeabur|frontend-static> [options]

Common options:
  --public-origin <url>      Final public origin for the Node service
  --backend-origin <url>     Backend origin for static frontend deployments
  --api-base-url <url>       Upstream LLM API base URL
  --api-key <value>          Upstream LLM API key
  --model <id>               Default model id
  --data-path <path>         UCLAW_DATA_PATH (default: .uclaw)
  --settings-password <pwd>  Optional lightweight settings gate password
  --output-dir <path>        Override output dir (default: deploy/generated/<target>)

Optional split frontend options:
  --frontend-api-base <url>
  --frontend-ws-url <url>

Examples:
  npm run deploy:init -- --target linux --public-origin https://chat.example.com --api-base-url https://api.openai.com/v1 --api-key sk-demo --model gpt-5.4
  npm run deploy:init -- --target vercel-static --backend-origin https://api.example.com`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function resolveTarget(rawTarget) {
  const normalized = String(rawTarget || '').trim().toLowerCase();
  return TARGET_ALIASES.get(normalized) || '';
}

function valueOrPlaceholder(value, placeholder) {
  const trimmed = String(value || '').trim();
  return trimmed || placeholder;
}

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildServerEnv(target, args) {
  const publicOrigin = valueOrPlaceholder(
    normalizeOrigin(args['public-origin'] || args.origin),
    'https://your-domain.example.com',
  );
  const apiBaseUrl = valueOrPlaceholder(args['api-base-url'], 'https://api.openai.com/v1');
  const apiKey = valueOrPlaceholder(args['api-key'], 'replace_me');
  const model = valueOrPlaceholder(args.model, 'gpt-5.4');
  const dataPath = valueOrPlaceholder(args['data-path'], '.uclaw');
  const port = valueOrPlaceholder(args.port, '3001');
  const lines = [
    'NODE_ENV=production',
    `PORT=${port}`,
    `CORS_ORIGIN=${valueOrPlaceholder(args['cors-origin'], publicOrigin)}`,
    `UCLAW_DATA_PATH=${dataPath}`,
  ];

  if (String(args['settings-password'] || '').trim()) {
    lines.push(`UCLAW_SETTINGS_ACCESS_PASSWORD=${args['settings-password'].trim()}`);
  }

  lines.push(
    `UCLAW_API_BASE_URL=${apiBaseUrl}`,
    `UCLAW_API_KEY=${apiKey}`,
    `UCLAW_DEFAULT_MODEL=${model}`,
  );

  if (String(args['feishu-app-id'] || '').trim()) {
    lines.push(`UCLAW_FEISHU_APP_ID=${args['feishu-app-id'].trim()}`);
  }
  if (String(args['feishu-app-secret'] || '').trim()) {
    lines.push(`UCLAW_FEISHU_APP_SECRET=${args['feishu-app-secret'].trim()}`);
  }
  if (String(args['feishu-agent-role-key'] || '').trim()) {
    lines.push(`UCLAW_FEISHU_AGENT_ROLE_KEY=${args['feishu-agent-role-key'].trim()}`);
  }

  lines.push('');

  return {
    fileName: target === 'linux' ? 'uclaw.env' : '.env.production',
    content: `${lines.join('\n')}`,
    publicOrigin,
  };
}

function buildFrontendEnv(args) {
  const backendOrigin = valueOrPlaceholder(
    normalizeOrigin(args['backend-origin'] || args['public-origin'] || args.origin),
    'https://your-backend.example.com',
  );
  const apiBase = normalizeOrigin(args['frontend-api-base']);
  const wsUrl = normalizeOrigin(args['frontend-ws-url']);
  const lines = [
    `VITE_BACKEND_ORIGIN=${backendOrigin}`,
  ];

  if (apiBase) {
    lines.push(`VITE_PUBLIC_API_BASE=${apiBase}`);
  }
  if (wsUrl) {
    lines.push(`VITE_PUBLIC_WS_URL=${wsUrl}`);
  }
  if (String(args['settings-password'] || '').trim()) {
    lines.push(`VITE_SETTINGS_ACCESS_PASSWORD=${args['settings-password'].trim()}`);
  }
  lines.push('');

  return {
    fileName: '.env.production.local',
    content: `${lines.join('\n')}`,
    backendOrigin,
  };
}

function buildGuide(target, context) {
  const notes = TARGET_NOTES[target];
  const lines = [
    `# ${notes.title} Deploy Preset`,
    '',
    notes.summary,
    '',
    '## Generated Files',
    '',
  ];

  for (const file of context.files) {
    lines.push(`- \`${file.fileName}\``);
  }

  lines.push(
    '',
    '## Commands',
    '',
    `- Install: \`npm ci\``,
    `- Build: \`${notes.buildCommand}\``,
    `- Start: \`${notes.startCommand}\``,
    `- Preflight: \`npm run deploy:check\``,
    '',
    '## Notes',
    '',
  );

  for (const note of notes.extraNotes) {
    lines.push(`- ${note}`);
  }

  lines.push('');

  if (context.serverEnv) {
    lines.push(
      '## Server Runtime',
      '',
      `- Public origin: \`${context.serverEnv.publicOrigin}\``,
      '- Health check: `/health`',
      '- Runtime path must stay inside the project root',
      '',
    );
  }

  if (context.frontendEnv) {
    lines.push(
      '## Static Frontend Build',
      '',
      `- Backend origin: \`${context.frontendEnv.backendOrigin}\``,
      '- Preferred deployment input: `VITE_BACKEND_ORIGIN`',
      '- `VITE_PUBLIC_API_BASE` / `VITE_PUBLIC_WS_URL` only need filling when API or WS are non-standard',
      '',
    );
  }

  lines.push(
    '## Reminder',
    '',
    '- Root `vercel.json` still blocks full-runtime deployment on Vercel.',
    '- This preset generator only removes manual env copy mistakes; it does not magically make unsupported targets supported.',
    '',
  );

  return `${lines.join('\n')}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true' || args.h === 'true') {
    printUsage();
    return;
  }

  const target = resolveTarget(args.target);
  if (!target) {
    console.error('[deploy:init] Missing or unsupported --target');
    printUsage();
    process.exitCode = 1;
    return;
  }

  const outputDir = path.resolve(
    projectRoot,
    String(args['output-dir'] || path.join('deploy', 'generated', target)),
  );

  const files = [];
  let serverEnv = null;
  let frontendEnv = null;

  if (target !== 'frontend-static') {
    serverEnv = buildServerEnv(target, args);
    files.push(serverEnv);
  }

  if (target === 'frontend-static') {
    frontendEnv = buildFrontendEnv(args);
    files.push(frontendEnv);
  }

  if (args['emit-frontend-static'] === 'true' && target !== 'frontend-static') {
    frontendEnv = buildFrontendEnv({
      ...args,
      'backend-origin': args['backend-origin'] || serverEnv?.publicOrigin || '',
    });
    files.push({
      ...frontendEnv,
      fileName: path.join('frontend-static', frontendEnv.fileName).replaceAll('\\', '/'),
    });
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await ensureDir(outputDir);

  for (const file of files) {
    const filePath = path.join(outputDir, file.fileName);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, file.content, 'utf8');
  }

  const summary = {
    target,
    generatedAt: new Date().toISOString(),
    outputDir,
    files: files.map((file) => file.fileName),
  };
  await fs.writeFile(path.join(outputDir, 'preset-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(outputDir, 'DEPLOYMENT.md'),
    buildGuide(target, { files, serverEnv, frontendEnv }),
    'utf8',
  );

  console.log(`[deploy:init] target: ${target}`);
  console.log(`[deploy:init] output: ${outputDir}`);
  for (const file of files) {
    console.log(`[deploy:init] wrote: ${path.join(outputDir, file.fileName)}`);
  }
  console.log(`[deploy:init] wrote: ${path.join(outputDir, 'DEPLOYMENT.md')}`);
}

main().catch((error) => {
  console.error('[deploy:init] failed:', error);
  process.exitCode = 1;
});
