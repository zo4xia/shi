import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';

// Message types for WebSocket communication
export type WSMessageType =
  | 'system:connected'
  | 'system:error'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'cowork:stream:message'
  | 'cowork:stream:messageUpdate'
  | 'cowork:stream:permission'
  | 'cowork:stream:complete'
  | 'cowork:stream:error'
  | 'cowork:sessions:changed'
  | 'im:status:change'
  | 'im:message:received'
  | 'scheduledTask:statusUpdate'
  | 'scheduledTask:runUpdate'
  | 'skills:changed'
  | 'mcp:changed'
  | 'api:stream:data'
  | 'api:stream:done'
  | 'api:stream:error'
  | 'api:stream:abort'
  | 'appUpdate:downloadProgress'
  | 'file:changed';

// File change event data structure
export interface FileChangeEvent {
  path: string;
  type: 'create' | 'modify' | 'delete';
  timestamp: number;
}

export interface WSMessage {
  type: WSMessageType;
  data: unknown;
  id?: string;
}

// Room-based subscription management
// Clients can subscribe to specific rooms (e.g., cowork session IDs)
interface WSClient {
  id: string;
  ws: WebSocket;
  rooms: Set<string>;
}

let wss: WebSocketServer | null = null;
const clients = new Map<WebSocket, WSClient>();
const roomSubscriptions = new Map<string, Set<WSClient>>();

// {标记} WS-FIX-1: messageUpdate batching — 合并高频流式更新，减少广播次数
// 每个 (sessionId, messageId) 只保留最新 content，50ms 内合并为一次广播
const pendingMessageUpdates = new Map<string, { sessionId: string; messageId: string; content: string; timer: ReturnType<typeof setTimeout> }>();
const MESSAGE_UPDATE_BATCH_INTERVAL = 50; // ms

export const batchedBroadcastMessageUpdate = (sessionId: string, messageId: string, content: string): void => {
  const key = `${sessionId}:${messageId}`;
  const existing = pendingMessageUpdates.get(key);

  if (existing) {
    // 更新 content，复用已有 timer
    existing.content = content;
    return;
  }

  const entry = {
    sessionId,
    messageId,
    content,
    timer: setTimeout(() => {
      const current = pendingMessageUpdates.get(key);
      if (current) {
        pendingMessageUpdates.delete(key);
        broadcastToRoom('cowork', current.sessionId, {
          type: 'cowork:stream:messageUpdate',
          data: { sessionId: current.sessionId, messageId: current.messageId, content: current.content },
        });
      }
    }, MESSAGE_UPDATE_BATCH_INTERVAL),
  };
  pendingMessageUpdates.set(key, entry);
};

// Flush all pending batched updates immediately (call on session complete/error)
export const flushPendingMessageUpdates = (sessionId: string): void => {
  for (const [key, entry] of pendingMessageUpdates) {
    if (entry.sessionId === sessionId) {
      clearTimeout(entry.timer);
      pendingMessageUpdates.delete(key);
      broadcastToRoom('cowork', entry.sessionId, {
        type: 'cowork:stream:messageUpdate',
        data: { sessionId: entry.sessionId, messageId: entry.messageId, content: entry.content },
      });
    }
  }
};

// Initialize WebSocket server
export const initWebSocketServer = (server: HTTPServer): WebSocketServer => {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = randomUUID();
    const client: WSClient = {
      id: clientId,
      ws,
      rooms: new Set(),
    };

    clients.set(ws, client);
    console.log(`[WebSocket] Client connected: ${clientId}`);

    // Send welcome message
    sendToClient(ws, {
      type: 'system:connected',
      data: { clientId },
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        handleClientMessage(client, message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      // Unsubscribe from all rooms
      client.rooms.forEach((room) => {
        const roomClients = roomSubscriptions.get(room);
        if (roomClients) {
          roomClients.delete(client);
          if (roomClients.size === 0) {
            roomSubscriptions.delete(room);
          }
        }
      });

      clients.delete(ws);
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for client ${clientId}:`, error);
    });

    // Respond to ping messages
    ws.on('ping', () => {
      ws.pong();
    });
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  return wss;
};

// Handle incoming messages from clients
const handleClientMessage = (client: WSClient, message: WSMessage) => {
  switch (message.type) {
    case 'subscribe': {
      // Subscribe to a room (e.g., cowork session)
      const roomId = message.data as string;
      if (roomId) {
        subscribeToRoom(client, roomId);
      }
      break;
    }

    case 'unsubscribe': {
      // Unsubscribe from a room
      const unsubscribeRoomId = message.data as string;
      if (unsubscribeRoomId) {
        unsubscribeFromRoom(client, unsubscribeRoomId);
      }
      break;
    }

    case 'ping':
      sendToClient(client.ws, {
        type: 'pong',
        data: { timestamp: Date.now() },
      });
      break;

    default:
      console.warn(`[WebSocket] Unknown message type: ${message.type}`);
  }
};

// Subscribe a client to a room
export const subscribeToRoom = (client: WSClient, roomId: string) => {
  client.rooms.add(roomId);

  if (!roomSubscriptions.has(roomId)) {
    roomSubscriptions.set(roomId, new Set());
  }
  roomSubscriptions.get(roomId)!.add(client);

  console.log(`[WebSocket] Client ${client.id} subscribed to room: ${roomId}`);
};

// Unsubscribe a client from a room
export const unsubscribeFromRoom = (client: WSClient, roomId: string) => {
  client.rooms.delete(roomId);

  const roomClients = roomSubscriptions.get(roomId);
  if (roomClients) {
    roomClients.delete(client);
    if (roomClients.size === 0) {
      roomSubscriptions.delete(roomId);
    }
  }

  console.log(`[WebSocket] Client ${client.id} unsubscribed from room: ${roomId}`);
};

// {标记} WS-FIX-2: backpressure 阈值 — 超过此值跳过非关键消息
const BACKPRESSURE_THRESHOLD = 1024 * 1024; // 1MB buffered data

// Send a message to a specific client
// skipOnBackpressure: true 时，如果客户端缓冲区过大则跳过（用于高频流式更新）
const sendToClient = (ws: WebSocket, message: WSMessage, skipOnBackpressure = false): boolean => {
  if (ws.readyState === WebSocket.OPEN) {
    // {标记} WS-FIX-2: 检查 bufferedAmount，慢客户端跳过非关键消息
    if (skipOnBackpressure && ws.bufferedAmount > BACKPRESSURE_THRESHOLD) {
      return false;
    }
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebSocket] Failed to send message:', error);
      return false;
    }
  }
  return false;
};

// Broadcast a message to all connected clients
export const broadcastToAll = (message: WSMessage): void => {
  clients.forEach((client) => {
    sendToClient(client.ws, message);
  });
};

// Broadcast a message to all clients subscribed to a specific room
export const broadcastToRoom = (roomNamespace: string, roomId: string, message: WSMessage): void => {
  const fullRoomId = `${roomNamespace}:${roomId}`;
  const roomClients = roomSubscriptions.get(fullRoomId);

  if (!roomClients || roomClients.size === 0) {
    return;
  }

  // {标记} WS-FIX-2: 高频流式更新允许 backpressure 跳过
  const skipOnBackpressure = message.type === 'cowork:stream:messageUpdate';

  let successCount = 0;
  roomClients.forEach((client) => {
    if (sendToClient(client.ws, message, skipOnBackpressure)) {
      successCount++;
    }
  });
};

// Send a message to a specific client by ID
export const sendToClientById = (clientId: string, message: WSMessage): boolean => {
  for (const client of clients.values()) {
    if (client.id === clientId) {
      return sendToClient(client.ws, message);
    }
  }
  return false;
};

// Get active WebSocket server instance
export const getWss = (): WebSocketServer | null => wss;

// Get connected clients count
export const getClientsCount = (): number => clients.size;

// Get room subscriber count
export const getRoomSubscribersCount = (roomNamespace: string, roomId: string): number => {
  const fullRoomId = `${roomNamespace}:${roomId}`;
  return roomSubscriptions.get(fullRoomId)?.size || 0;
};

// Export types for use in other modules
export type { WSClient };
