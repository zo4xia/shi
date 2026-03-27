const lines = [
  '[deploy] Vercel is not a supported full-runtime target for this repository.',
  '[deploy] Why this build is blocked:',
  '  1. The frontend build outputs to server/public, not a root dist directory.',
  '  2. The backend starts a custom Express HTTP server and a WebSocket server.',
  '  3. Core cowork and runtime updates depend on /ws and long-lived server state.',
  '',
  '[deploy] Recommended targets:',
  '  - Standard Linux host / VM',
  '  - Render web service',
  '  - Zeabur service in non-static mode',
  '',
  '[deploy] Stable commands for supported hosts:',
  '  install: npm ci',
  '  build:   npm run build',
  '  start:   npm start',
  '',
  '[deploy] If you only need a static shell, that is a separate deployment mode and must be split intentionally.'
];

for (const line of lines) {
  console.error(line);
}

process.exit(1);
