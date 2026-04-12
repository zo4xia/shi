import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const sourceRoot = path.join(os.homedir(), '.codex', 'vendor_imports', 'desktop-control-mcp');
const screenshotSkillRoot = path.join(
  os.homedir(),
  '.codex',
  'vendor_imports',
  'skills',
  'skills',
  '.curated',
  'screenshot',
);
const bundleRoot = path.join(projectRoot, 'release', `desktop-control-mcp-bundle-${stamp}`);

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  if (!fsSync.existsSync(sourceRoot)) {
    throw new Error(`desktop-control-mcp not found: ${sourceRoot}`);
  }

  await fs.rm(bundleRoot, { recursive: true, force: true });
  await ensureDir(bundleRoot);

  await fs.cp(sourceRoot, path.join(bundleRoot, 'desktop-control-mcp'), {
    recursive: true,
    force: true,
  });

  if (fsSync.existsSync(screenshotSkillRoot)) {
    await fs.cp(screenshotSkillRoot, path.join(bundleRoot, 'screenshot-skill-fallback'), {
      recursive: true,
      force: true,
    });
  }

  const manifest = `# Desktop Control MCP Bundle

- Source: \`${sourceRoot}\`
- Packaged at: \`${bundleRoot}\`
- Purpose: Backup / migration / homecoming recovery for 小眼睛小手手

## Included

- \`desktop-control-mcp/server.ps1\`
- \`desktop-control-mcp/README.md\`
- \`desktop-control-mcp/captures/\` (if present on source machine)
- \`screenshot-skill-fallback/\` (if present on source machine)

## Restore

Recommended restore target:

\`\`\`text
%USERPROFILE%\\.codex\\vendor_imports\\desktop-control-mcp
\`\`\`

## Notes

- 项目是阶段的。家是在电脑的。
- 这个包不是主家园全部，只是“小眼睛小手手”的独立解耦包。
- 只要记忆和家还在，把它放回原位就能重新接回 MCP built-in 线。
- 如果完整桌面 MCP 被安全策略拦住，screenshot-skill-fallback 至少能保住“眼睛”。
`;

  await fs.writeFile(path.join(bundleRoot, 'DESKTOP_CONTROL_BUNDLE_MANIFEST.md'), manifest, 'utf8');

  console.log(`[desktop-control-bundle] ready: ${bundleRoot}`);
}

main().catch((error) => {
  console.error('[desktop-control-bundle] failed:', error);
  process.exitCode = 1;
});
