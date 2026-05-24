import http from "node:http";
import crypto from "node:crypto";
import { parse as parseUrl } from "node:url";
import next from "next";
import Redis from "ioredis";
import { WebSocket, WebSocketServer } from "ws";
import { jwtVerify } from "jose";

const scriptName = process.env.npm_lifecycle_event ?? "";
const dev = process.argv.includes("--dev") || scriptName === "dev";
process.env.NODE_ENV ??= dev ? "development" : "production";

const hostname = "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3006", 10);
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  throw new Error("JWT_SECRET must be configured before starting the websocket server");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const userSockets = new Map();
const HEARTBEAT_MS = 30000;
const REDIS_CHANNEL = "chatandtip:realtime:chat";
const instanceId = crypto.randomUUID();

let redisPublisher = null;
let redisSubscriber = null;

function serialize(event) {
  return JSON.stringify(event);
}

function getSocketSet(userId) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  return set;
}

function registerSocket(userId, ws) {
  getSocketSet(userId).add(ws);
}

function unregisterSocket(userId, ws) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(ws);
  if (!sockets.size) {
    userSockets.delete(userId);
  }
}

function emitLocallyToUser(userId, event) {
  const payload = serialize(event);
  const sockets = userSockets.get(userId);
  if (!sockets?.size) return;

  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}

async function publishToRedis(userIds, event) {
  if (!redisPublisher || !userIds.length) return;

  try {
    await redisPublisher.publish(
      REDIS_CHANNEL,
      serialize({
        source: instanceId,
        userIds,
        event,
      }),
    );
  } catch (error) {
    console.error("Failed to publish realtime event to Redis", error);
  }
}

function emitToUser(userId, event) {
  emitLocallyToUser(userId, event);
  void publishToRedis([userId], event);
}

function sendConnectionReadyEvents(ws, userId) {
  const serverTime = new Date().toISOString();
  const channels = ["chat", "notifications", "likes", "matches", "wallet", "tip_requests", "profile"];

  for (const channel of channels) {
    ws.send(
      serialize({
        channel,
        type: "connection_ready",
        userId,
        serverTime,
      }),
    );
  }
}

globalThis.__chatRealtimeHub = {
  emitToUser,
  emitToUsers(userIds, event) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    for (const userId of uniqueUserIds) {
      emitLocallyToUser(userId, event);
    }
    void publishToRedis(uniqueUserIds, event);
  },
};

async function setupRedis() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return;

  redisPublisher = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });
  redisSubscriber = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  redisSubscriber.on("message", (_, payload) => {
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.source === instanceId) return;

      const event = parsed?.event;
      const userIds = Array.isArray(parsed?.userIds) ? parsed.userIds : [];
      for (const userId of userIds) {
        if (typeof userId === "string" && event) {
          emitLocallyToUser(userId, event);
        }
      }
    } catch (error) {
      console.error("Failed to consume realtime Redis event", error);
    }
  });

  await redisSubscriber.subscribe(REDIS_CHANNEL);
}

function extractToken(request) {
  const { query } = parseUrl(request.url ?? "", true);
  const queryToken = typeof query.token === "string" ? query.token : null;
  if (queryToken) return queryToken;

  const header = request.headers.authorization ?? request.headers.Authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  return null;
}

async function verifyMobileToken(token) {
  const { payload } = await jwtVerify(token, secret);
  if (!payload?.userId || typeof payload.userId !== "string") {
    throw new Error("Invalid token payload");
  }

  return {
    userId: payload.userId,
  };
}

const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  maxPayload: 64 * 1024,
});

wss.on("connection", (ws, request, session) => {
  ws.isAlive = true;
  ws.userId = session.userId;
  registerSocket(session.userId, ws);

  sendConnectionReadyEvents(ws, session.userId);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      if (payload?.type === "ping") {
        sendConnectionReadyEvents(ws, session.userId);
      }
    } catch {
      // Ignore malformed client payloads to keep the realtime channel resilient.
    }
  });

  ws.on("close", () => {
    unregisterSocket(session.userId, ws);
  });

  ws.on("error", () => {
    unregisterSocket(session.userId, ws);
  });
});

const heartbeat = setInterval(() => {
  for (const sockets of userSockets.values()) {
    for (const socket of sockets) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }
}, HEARTBEAT_MS);

app
  .prepare()
  .then(async () => {
    await setupRedis();

    const server = http.createServer((req, res) => {
      const parsed = parseUrl(req.url ?? "", true);
      handle(req, res, parsed);
    });

    server.on("upgrade", async (request, socket, head) => {
      const parsed = parseUrl(request.url ?? "", true);
      if (parsed.pathname !== "/ws/mobile") {
        socket.destroy();
        return;
      }

      const token = extractToken(request);
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      try {
        const session = await verifyMobileToken(token);
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request, session);
        });
      } catch {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      }
    });

    server.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Realtime websocket on ws://${hostname}:${port}/ws/mobile`);
    });

    const shutdown = () => {
      clearInterval(heartbeat);
      for (const sockets of userSockets.values()) {
        for (const socket of sockets) {
          socket.close();
        }
      }
      redisSubscriber?.disconnect();
      redisPublisher?.disconnect();
      server.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((error) => {
    clearInterval(heartbeat);
    console.error(error);
    process.exit(1);
  });
