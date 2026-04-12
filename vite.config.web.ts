/**
 * Vite Config for Web Build
 * Pure web version without Electron plugins
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

const devHost = process.env.VITE_DEV_HOST || '127.0.0.1';
const devPort = Number(process.env.VITE_DEV_PORT || '5176');
const hmrPort = Number(process.env.VITE_HMR_PORT || '5177');
const katexVersion = process.env.npm_package_dependencies_katex?.replace(/^[~^]/, '') || '0.16.10';

// {标记} P0修复: dev proxy 目标必须是本地后端，不能读 VITE_API_BASE_URL（那是外部API地址）
const backendHost = process.env.VITE_BACKEND_HOST || '127.0.0.1';
const backendPort = Number(process.env.VITE_BACKEND_PORT || '3001');
const apiBase = `http://${backendHost}:${backendPort}`;

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildDeploymentMetaReplacements() {
  return {
    __UCLAW_META_BACKEND_ORIGIN__: escapeHtmlAttribute(process.env.VITE_BACKEND_ORIGIN || ''),
    __UCLAW_META_API_BASE__: escapeHtmlAttribute(process.env.VITE_PUBLIC_API_BASE || ''),
    __UCLAW_META_WS_URL__: escapeHtmlAttribute(process.env.VITE_PUBLIC_WS_URL || ''),
    __UCLAW_META_SETTINGS_PASSWORD__: escapeHtmlAttribute(process.env.VITE_SETTINGS_ACCESS_PASSWORD || ''),
  };
}

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(katexVersion),
    // Define build mode constants
    __WEB_BUILD__: 'true',
    __ELECTRON_BUILD__: 'false',
  },
  plugins: [
    react(),
    tsconfigPaths(),  // Reads paths from tsconfig.json — no hardcoded aliases
    {
      name: 'uclaw-deployment-meta-injector',
      transformIndexHtml(html) {
        const replacements = buildDeploymentMetaReplacements();
        let nextHtml = html;
        for (const [token, value] of Object.entries(replacements)) {
          nextHtml = nextHtml.replaceAll(token, value);
        }
        return nextHtml;
      },
    },
  ],
  base: '/',
  build: {
    outDir: 'server/public',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        team: path.resolve(__dirname, 'team.html'),
      },
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit'],
          'markdown-vendor': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'mermaid'],
        },
      },
    },
  },
  server: {
    port: devPort,
    strictPort: false,
    host: devHost,
    hmr: {
      host: devHost,
      port: hmrPort,
    },
    watch: {
      usePolling: true,
      ignored: [
        '**/.env',
        '**/.env.*',
        '**/3-main-backup-*/**',
        '**/_memory_backup/**',
        '**/docs/_memory_backup/**',
      ],
    },
    open: process.env.VITE_OPEN_BROWSER === 'true',
    // Proxy API requests to backend server during development
    proxy: {
      '/api': {
        target: apiBase,
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      '/ws': {
        target: apiBase.replace('http://', 'ws://').replace('https://', 'wss://'),
        ws: true,
      },
      // Proxy static files from server/public (tutorial.html etc.)
      '/tutorial.html': {
        target: apiBase,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        __VERSION__: JSON.stringify(katexVersion),
      },
    },
  },
  clearScreen: false,
});
