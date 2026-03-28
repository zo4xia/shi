const DEV_PORT = typeof import.meta.env.VITE_DEV_PORT === 'string' && import.meta.env.VITE_DEV_PORT.trim()
  ? import.meta.env.VITE_DEV_PORT.trim()
  : '5176';

const DEFAULT_DEV_BACKEND_HOST = typeof import.meta.env.VITE_BACKEND_HOST === 'string' && import.meta.env.VITE_BACKEND_HOST.trim()
  ? import.meta.env.VITE_BACKEND_HOST.trim()
  : '127.0.0.1';

const DEFAULT_DEV_BACKEND_PORT = typeof import.meta.env.VITE_BACKEND_PORT === 'string' && import.meta.env.VITE_BACKEND_PORT.trim()
  ? import.meta.env.VITE_BACKEND_PORT.trim()
  : '3001';

const PLACEHOLDER_PATTERN = /^%[A-Z0-9_]+%$/i;

declare global {
  interface Window {
    __UCLAW_RUNTIME__?: Partial<RuntimeEndpointConfig>;
  }
}

function cleanValue(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function readMetaContent(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const element = document.querySelector(`meta[name="${name}"]`);
  return cleanValue(element?.getAttribute('content'));
}

function readQueryParam(name: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return cleanValue(new URLSearchParams(window.location.search).get(name));
}

function readLocalStorage(key: string): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return cleanValue(window.localStorage.getItem(key));
  } catch {
    return '';
  }
}

function readInjectedRuntimeValue(key: keyof RuntimeEndpointConfig): string {
  if (typeof window === 'undefined' || !window.__UCLAW_RUNTIME__) {
    return '';
  }
  return cleanValue(window.__UCLAW_RUNTIME__[key]);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeBackendOrigin(value: string): string {
  return trimTrailingSlash(value);
}

function normalizeApiBase(value: string): string {
  if (!value) {
    return '';
  }
  if (value.startsWith('/')) {
    return trimTrailingSlash(value);
  }
  return trimTrailingSlash(value);
}

function toWsProtocol(protocol: string): string {
  return protocol === 'https:' ? 'wss:' : 'ws:';
}

function normalizeWsUrl(value: string): string {
  if (!value) {
    return '';
  }
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    return trimTrailingSlash(value);
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    const url = new URL(value);
    return `${toWsProtocol(url.protocol)}//${url.host}${trimTrailingSlash(url.pathname)}`;
  }
  return trimTrailingSlash(value);
}

function getConfiguredValue(options: {
  queryKeys: string[];
  storageKeys: string[];
  metaNames: string[];
  envKeys: string[];
}): string {
  for (const key of options.queryKeys) {
    const value = readQueryParam(key);
    if (value) {
      return value;
    }
  }
  for (const key of options.storageKeys) {
    const value = readLocalStorage(key);
    if (value) {
      return value;
    }
  }
  for (const name of options.metaNames) {
    const value = readMetaContent(name);
    if (value) {
      return value;
    }
  }
  for (const key of options.envKeys) {
    const value = cleanValue((import.meta.env as Record<string, string | undefined>)[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function resolveDefaultBackendOrigin(): string {
  const isViteDevHost = import.meta.env.DEV && typeof window !== 'undefined' && window.location.port === DEV_PORT;
  if (!isViteDevHost) {
    return '';
  }
  return `http://${DEFAULT_DEV_BACKEND_HOST}:${DEFAULT_DEV_BACKEND_PORT}`;
}

function buildApiBase(backendOrigin: string): string {
  return `${normalizeBackendOrigin(backendOrigin)}/api`;
}

function buildWsUrl(backendOrigin: string): string {
  const normalized = normalizeBackendOrigin(backendOrigin);
  const url = new URL(normalized);
  return `${toWsProtocol(url.protocol)}//${url.host}${trimTrailingSlash(url.pathname)}/ws`;
}

export interface RuntimeEndpointConfig {
  apiBase: string;
  wsUrl: string;
  backendOrigin: string;
}

export function resolveRuntimeEndpointConfig(): RuntimeEndpointConfig {
  const injectedBackendOrigin = readInjectedRuntimeValue('backendOrigin');
  const injectedApiBase = readInjectedRuntimeValue('apiBase');
  const injectedWsUrl = readInjectedRuntimeValue('wsUrl');

  const explicitBackendOrigin = getConfiguredValue({
    queryKeys: ['backendOrigin', 'backend', 'serverOrigin'],
    storageKeys: ['uclaw.runtime.backendOrigin', 'uclaw.runtime.serverOrigin'],
    metaNames: ['uclaw-backend-origin'],
    envKeys: ['VITE_BACKEND_ORIGIN'],
  });

  const explicitApiBase = getConfiguredValue({
    queryKeys: ['apiBase'],
    storageKeys: ['uclaw.runtime.apiBase'],
    metaNames: ['uclaw-api-base'],
    envKeys: ['VITE_PUBLIC_API_BASE'],
  });

  const explicitWsUrl = getConfiguredValue({
    queryKeys: ['wsUrl', 'wsBase'],
    storageKeys: ['uclaw.runtime.wsUrl', 'uclaw.runtime.wsBase'],
    metaNames: ['uclaw-ws-url'],
    envKeys: ['VITE_PUBLIC_WS_URL', 'VITE_WS_URL'],
  });

  const backendOrigin = normalizeBackendOrigin(
    injectedBackendOrigin || explicitBackendOrigin || resolveDefaultBackendOrigin()
  );
  const apiBase = normalizeApiBase(
    injectedApiBase || explicitApiBase || (backendOrigin ? buildApiBase(backendOrigin) : '/api')
  );

  const sameOriginWsUrl = typeof window !== 'undefined'
    ? `${toWsProtocol(window.location.protocol)}//${window.location.host}/ws`
    : '/ws';
  const wsUrl = normalizeWsUrl(
    injectedWsUrl || explicitWsUrl || (backendOrigin ? buildWsUrl(backendOrigin) : sameOriginWsUrl)
  );

  return {
    apiBase,
    wsUrl,
    backendOrigin,
  };
}
