/**
 * WebSocket Client for Web Build
 * Replaces IPC event listeners with WebSocket events
 */

import { COWORK_WS_EVENTS } from './webApiContract';
import { resolveRuntimeEndpointConfig } from './runtimeEndpoints';

type EventCallback<T = unknown> = (data: T) => void;
type CleanupFn = () => void;

interface WebSocketMessage {
  type: string;
  data: unknown;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isManuallyClosed = false;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private connectPromise: Promise<void> | null = null;

  // {标记} WS-FIX-3: 发送队列 — 断连期间缓存消息，重连后自动发送
  private sendQueue: WebSocketMessage[] = [];
  private readonly maxQueueSize = 100;

  // {标记} WS-FIX-3: 已订阅 room 追踪 — 重连后自动重新订阅
  private subscribedRooms = new Set<string>();

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.isManuallyClosed = false;

          // {标记} WS-FIX-3: 重连后自动重新订阅所有 room
          for (const roomId of this.subscribedRooms) {
            this.sendRaw('subscribe', roomId);
          }

          // {标记} WS-FIX-3: flush 发送队列
          const queue = this.sendQueue.splice(0);
          for (const msg of queue) {
            this.sendRaw(msg.type, msg.data);
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.emit(message.type, message.data);
          } catch (error) {
            // Silent fail on parse errors to avoid console spam
          }
        };

        this.ws.onerror = () => {
          // WebSocket onerror fires an Event (not Error), convert to proper Error
          this.connectPromise = null;
          reject(new Error(`WebSocket connection failed: ${this.url}`));
        };

        this.ws.onclose = () => {
          this.connectPromise = null;

          if (!this.isManuallyClosed) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
              this.reconnectAttempts++;
              const maxDelay = 30000;
              const delay = Math.min(
                this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
                maxDelay
              );
              setTimeout(() => this.connect(), delay);
            } else {
              // {FIX} 超过最大重连次数后，启动慢速恢复轮询（每60秒尝试一次）
              console.warn('[WebSocket] Max reconnect attempts reached, starting slow recovery polling');
              const recoveryInterval = setInterval(() => {
                if (this.isManuallyClosed) {
                  clearInterval(recoveryInterval);
                  return;
                }
                if (this.ws?.readyState === WebSocket.OPEN) {
                  clearInterval(recoveryInterval);
                  return;
                }
                this.reconnectAttempts = 0; // 重置计数器，让connect内部的正常重连逻辑接管
                this.connect().then(() => {
                  clearInterval(recoveryInterval);
                }).catch(() => {
                  // 继续轮询
                });
              }, 60000);
            }
          }
        };
      } catch (error) {
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  disconnect(): void {
    this.isManuallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectPromise = null;
    // {标记} WS-FIX-3: 手动断连时清理队列和 room 追踪
    this.sendQueue.length = 0;
    this.subscribedRooms.clear();
  }

  private emit(type: string, data: unknown): void {
    const callbacks = this.listeners.get(type);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }

  on<T = unknown>(type: string, callback: EventCallback<T>): CleanupFn {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback as EventCallback);

    // Auto-connect if not connected (silent — errors handled by reconnect logic)
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect().catch(() => {/* reconnect handled by onclose */});
    }

    // Return cleanup function
    return () => {
      const callbacks = this.listeners.get(type);
      if (callbacks) {
        callbacks.delete(callback as EventCallback);
        if (callbacks.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  // 内部直接发送（不入队）
  private sendRaw(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data } as WebSocketMessage));
    }
  }

  // {标记} WS-FIX-3: 断连时入队，连接时直接发送
  send(type: string, data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw(type, data);
    } else if (!this.isManuallyClosed && this.sendQueue.length < this.maxQueueSize) {
      this.sendQueue.push({ type, data });
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  // {标记} WS-FIX-3: subscribe/unsubscribe 追踪 room，重连后自动恢复
  subscribe(roomId: string): void {
    this.subscribedRooms.add(roomId);
    this.send('subscribe', roomId);
  }

  unsubscribe(roomId: string): void {
    this.subscribedRooms.delete(roomId);
    this.send('unsubscribe', roomId);
  }
}

// WebSocket event types (matching IPC events)
export const WS_EVENTS = {
  // Cowork events
  COWORK_MESSAGE: COWORK_WS_EVENTS.message,
  COWORK_MESSAGE_UPDATE: COWORK_WS_EVENTS.messageUpdate,
  COWORK_PERMISSION: COWORK_WS_EVENTS.permission,
  COWORK_COMPLETE: COWORK_WS_EVENTS.complete,
  COWORK_ERROR: COWORK_WS_EVENTS.error,
  COWORK_SESSIONS_CHANGED: COWORK_WS_EVENTS.sessionsChanged,

  // Scheduled task events
  TASK_STATUS_UPDATE: 'scheduledTask:statusUpdate',
  TASK_RUN_UPDATE: 'scheduledTask:runUpdate',

  // Skill events
  SKILLS_CHANGED: 'skills:changed',
  MCP_CHANGED: 'mcp:changed',

  // File events
  FILE_CHANGED: 'file:changed',
} as const;

export const webSocketClient = new WebSocketClient(resolveRuntimeEndpointConfig().wsUrl);
