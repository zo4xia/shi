import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const bundleRoot = path.join(projectRoot, 'release', `uclaw-linux-standard-${stamp}`);
const bundleZip = `${bundleRoot}.zip`;
const require = createRequire(import.meta.url);
const { ZipFile } = require('yazl');

const rootFiles = [
  '.env.example',
  '.eslintrc.cjs',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'LICENSE',
  'README.md',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.web.ts',
  'index.html',
  'team.html',
  'team_page.html',
  'team_bundle.js',
  'zbpack.json',
];

const rootDirs = [
  'clean-room/spine/modules',
  'deploy',
  'docs',
  'patches',
  'public',
  'server',
  'SKILLs',
  'src',
];

function normalize(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFileRelative(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const targetPath = path.join(bundleRoot, relativePath);
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath);
}

async function copyDirRelative(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  if (!fsSync.existsSync(sourcePath)) {
    return;
  }
  const targetPath = path.join(bundleRoot, relativePath);
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter: (source) => {
      const relative = normalize(path.relative(projectRoot, source));
      if (!relative) return true;
      if (relative.startsWith('.git/')) return false;
      if (relative === 'node_modules' || relative.startsWith('node_modules/')) return false;
      if (relative.includes('/node_modules/')) return false;
      if (relative.endsWith('/node_modules')) return false;
      if (relative.startsWith('.uclaw/')) return false;
      if (relative.startsWith('release/')) return false;
      if (relative.startsWith('server/dist/')) return false;
      if (relative.startsWith('server/public/')) return false;
      if (relative.endsWith('.sqlite')) return false;
      if (relative.endsWith('.db')) return false;
      return true;
    },
  });
}

async function writeManifest() {
  const manifest = `# Delivery Manifest

- Bundle: \`${path.basename(bundleRoot)}\`
- Zip: \`${path.basename(bundleZip)}\`
- Standard: \`npm + systemd + env\`
- Install: \`npm ci\`
- Build: \`npm run build\`
- Preflight: \`npm run deploy:check\`
- Preset init: \`npm run deploy:init -- --target linux ...\`
- Start: \`npm start\`
- Zeabur: \`zbpack.json\`
- Linux guide: \`docs/DEPLOYMENT_AUTOGUIDE.md\`
- Env template: \`deploy/linux/uclaw.env.example\`
- Systemd unit: \`deploy/linux/uclaw.service\`
`;
  await fs.writeFile(path.join(bundleRoot, 'DELIVERY_MANIFEST.md'), manifest, 'utf8');
}

async function zipBundle() {
  await fs.rm(bundleZip, { force: true });

  const zipFile = new ZipFile();
  const output = fsSync.createWriteStream(bundleZip);

  async function walk(relativeDir = '') {
    const absoluteDir = path.join(bundleRoot, relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      const nextRelative = path.join(relativeDir, entry.name);
      const absolutePath = path.join(bundleRoot, nextRelative);
      const archivePath = normalize(nextRelative);
      if (entry.isDirectory()) {
        zipFile.addEmptyDirectory(`${archivePath}/`);
        await walk(nextRelative);
        continue;
      }
      zipFile.addFile(absolutePath, archivePath);
    }
  }

  await walk();
  zipFile.end();
  await pipeline(zipFile.outputStream, output);
}

async function main() {
  await fs.rm(bundleRoot, { recursive: true, force: true });
  await ensureDir(bundleRoot);

  for (const file of rootFiles) {
    await copyFileRelative(file);
  }

  await ensureDir(path.join(bundleRoot, 'scripts'));
  const scripts = await fs.readdir(path.join(projectRoot, 'scripts'));
  for (const file of scripts) {
    await copyFileRelative(path.join('scripts', file));
  }

  for (const dir of rootDirs) {
    await copyDirRelative(dir);
  }

  await writeManifest();
  await zipBundle();

  console.log(`[delivery-bundle] ready: ${bundleRoot}`);
  console.log(`[delivery-bundle] ready: ${bundleZip}`);
}

main().catch((error) => {
  console.error('[delivery-bundle] failed:', error);
  process.exitCode = 1;
});
