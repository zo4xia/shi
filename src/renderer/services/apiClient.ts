/**
 * API Client for Web Build
 * Replaces window.electron IPC calls with HTTP requests
 */

import { resolveRuntimeEndpointConfig } from './runtimeEndpoints';

// {路标} FLOW-FRONTEND-API-CLIENT
// {FLOW} FRONTEND-HTTP-TRUNK: 前端凡是走 HTTP 的请求，最终都会在这里拼成 /api/* 再发往当前本地服务端。

// {标记} P0修复: 前端业务请求必须指向 UCLAW 后端入口，而不是模型供应商 API 地址。
// 优先级：
// 1. 显式前端覆盖 VITE_PUBLIC_API_BASE / 页面注入 / query / localStorage
// 2. 单个 BACKEND_ORIGIN 自动推导出 `${origin}/api`
// 3. 默认同源 `/api`
const API_BASE = resolveRuntimeEndpointConfig().apiBase;

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    try {
      const url = this.buildUrl(path);
      const method = (options.method || 'GET').toUpperCase();
      const response = await fetch(url, {
        ...options,
        cache: options.cache ?? 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(method === 'GET' || method === 'HEAD'
            ? {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                Pragma: 'no-cache',
              }
            : {}),
          ...options.headers,
        },
      });

      if (response.status === 304) {
        return {
          success: false,
          error: `HTTP ${response.status}: stale cached response without body`,
        };
      }

      const rawText = response.status === 204 || response.status === 205
        ? ''
        : await response.text();
      let data: unknown = undefined;
      if (rawText.trim()) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = JSON.parse(rawText);
        } else {
          data = rawText;
        }
      }

      if (!response.ok) {
        const errorData = (data && typeof data === 'object') ? data as Record<string, unknown> : null;
        return {
          success: false,
          error:
            (typeof errorData?.error === 'string' && errorData.error)
            || (typeof errorData?.message === 'string' && errorData.message)
            || `HTTP ${response.status}`,
        };
      }

      return { success: true, data: data as T };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  async get<T>(path: string): Promise<{ success: boolean; data?: T; error?: string }> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<{ success: boolean; data?: T; error?: string }> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body: unknown): Promise<{ success: boolean; data?: T; error?: string }> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(path: string): Promise<{ success: boolean; data?: T; error?: string }> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // Streaming API (SSE)
  async stream(
    path: string,
    body: unknown,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): Promise<AbortController> {
    const controller = new AbortController();
    const url = this.buildUrl(path);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        onError(`HTTP ${response.status}`);
        return controller;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('No response body');
        return controller;
      }

      const decoder = new TextDecoder();

      const read = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            onChunk(chunk);
          }
          onComplete();
        } catch (error) {
          if (error instanceof Error && error.name !== 'AbortError') {
            onError(error.message);
          }
        }
      };

      read();
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        onError(error.message);
      }
    }

    return controller;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Singleton instance
export const apiClient = new ApiClient();
