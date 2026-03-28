#!/usr/bin/env node
import { Command } from 'commander';
import os from 'os';
import open from 'open';
import { startServer } from './index.js';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths.js';

const program = new Command();

function collectAccessUrls(host: string, port: number): string[] {
  const urls = new Set<string>();

  const push = (value: string | null | undefined) => {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next) {
      urls.add(next);
    }
  };

  const localhostUrl = `http://127.0.0.1:${port}`;

  if (host === '127.0.0.1' || host === 'localhost') {
    push(localhostUrl);
    return Array.from(urls);
  }

  if (host === '0.0.0.0' || host === '::') {
    push(localhostUrl);
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        if (!entry || entry.internal || entry.family !== 'IPv4') {
          continue;
        }
        push(`http://${entry.address}:${port}`);
      }
    }
    return Array.from(urls);
  }

  push(`http://${host}:${port}`);
  return Array.from(urls);
}

program
  .name('uclaw')
  .description('UCLAW - AI-powered assistant with local web UI')
  .version('0.3.0')
  .option('-p, --port <number>', 'Port to run server on', '3001')
  .option('--host <string>', 'Host to bind to', '127.0.0.1')
  .option('--no-open', 'Don\'t open browser automatically')
  .option('--data-dir <path>', 'Custom data directory')
  .option('--workspace <path>', 'Workspace directory (default: current project root)')
  .action(async (options) => {
    const port = parseInt(options.port);
    const host = options.host;
    const workspace = options.workspace || getProjectRoot();

    console.log(`🦞 Starting UCLAW...`);
    console.log(`   Port: ${port}`);
    console.log(`   Host: ${host}`);
    console.log(`   Workspace: ${workspace}`);

    try {
      const server = await startServer({
        port,
        host,
        dataDir: options.dataDir,
        workspace
      });

      const addressInfo = server.address();
      const actualPort = typeof addressInfo === 'object' && addressInfo
        ? addressInfo.port
        : port;
      const accessUrls = collectAccessUrls(host, actualPort);
      const primaryUrl = accessUrls[0] || `http://${host}:${actualPort}`;

      console.log(`\n✅ UCLAW is running`);
      for (const url of accessUrls) {
        console.log(`   ${url}`);
      }

      if (options.open !== false) {
        console.log(`   Opening browser...`);
        await open(primaryUrl);
      }
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program.parse();
