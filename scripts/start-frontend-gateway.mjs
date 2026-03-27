import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import tls from 'tls';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const staticRoot = path.join(projectRoot, 'server', 'public');

const gatewayHost = process.env.UCLAW_FRONTEND_HOST || '0.0.0.0';
const gatewayPort = Number(process.env.UCLAW_FRONTEND_PORT || process.env.VITE_DEV_PORT || '5176');
const backendTargetRaw = process.env.UCLAW_FRONTEND_BACKEND_URL
  || `http://${process.env.UCLAW_BACKEND_HOST || '127.0.0.1'}:${process.env.UCLAW_BACKEND_PORT || process.env.PORT || '3001'}`;
const backendTarget = new URL(backendTargetRaw);
const isBackendTls = backendTarget.protocol === 'https:';
const backendPort = Number(backendTarget.port || (isBackendTls ? 443 : 80));

const app = express();

const proxyHttpRequest = (req, res) => {
  const transport = isBackendTls ? https : http;
  const upstreamRequest = transport.request(
    {
      protocol: backendTarget.protocol,
      hostname: backendTarget.hostname,
      port: backendPort,
      method: req.method,
      path: req.originalUrl,
      headers: {
        ...req.headers,
        host: backendTarget.host,
        connection: req.headers.upgrade ? 'Upgrade' : 'keep-alive',
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http',
        'x-forwarded-for': req.socket.remoteAddress || '',
      },
    },
    (upstreamResponse) => {
      const headers = { ...upstreamResponse.headers };
      delete headers['content-length'];
      res.writeHead(upstreamResponse.statusCode || 502, headers);
      upstreamResponse.pipe(res);
    }
  );

  upstreamRequest.on('error', (error) => {
    console.error(`[frontend-gateway] HTTP proxy failed for ${req.method} ${req.originalUrl}:`, error.message);
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: 'frontend gateway proxy failed' });
    } else {
      res.end();
    }
  });

  req.pipe(upstreamRequest);
};

// {FLOW} FRONTEND-GATEWAY-TRUNK: 5176 只做“本地式前端门面”，API/WS 一律回源 3001，静态资源固定读 server/public。
app.use('/api', proxyHttpRequest);
app.use('/health', proxyHttpRequest);
app.use('/tutorial.html', proxyHttpRequest);

if (!fs.existsSync(path.join(staticRoot, 'index.html'))) {
  throw new Error(`[frontend-gateway] Missing frontend build output: ${path.join(staticRoot, 'index.html')}`);
}

app.use(express.static(staticRoot, {
  index: false,
  maxAge: '1h',
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/ws')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  res.sendFile(path.join(staticRoot, 'index.html'));
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) {
    socket.destroy();
    return;
  }

  const connect = isBackendTls ? tls.connect : net.connect;
  const upstream = connect(
    {
      host: backendTarget.hostname,
      port: backendPort,
      servername: isBackendTls ? backendTarget.hostname : undefined,
    },
    () => {
      const headerLines = [`GET ${req.url} HTTP/1.1`, `Host: ${backendTarget.host}`];

      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'undefined' || key.toLowerCase() === 'host') {
          continue;
        }
        if (Array.isArray(value)) {
          headerLines.push(`${key}: ${value.join(', ')}`);
        } else {
          headerLines.push(`${key}: ${value}`);
        }
      }

      headerLines.push('', '');
      upstream.write(headerLines.join('\r\n'));

      if (head?.length) {
        upstream.write(head);
      }

      socket.pipe(upstream).pipe(socket);
    }
  );

  upstream.on('error', (error) => {
    console.error(`[frontend-gateway] WS proxy failed for ${req.url}:`, error.message);
    socket.destroy();
  });

  socket.on('error', () => {
    upstream.destroy();
  });
});

server.listen(gatewayPort, gatewayHost, () => {
  console.log(`[frontend-gateway] Ready at http://${gatewayHost}:${gatewayPort}`);
  console.log(`[frontend-gateway] Static root: ${staticRoot}`);
  console.log(`[frontend-gateway] Backend target: ${backendTarget.origin}`);
});
