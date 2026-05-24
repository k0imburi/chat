/**
 * PM2 Ecosystem Config — ChatAndTip
 *
 * Start:   pm2 start ecosystem.config.cjs
 * Reload:  pm2 reload chatandtip          (zero-downtime rolling reload)
 * Stop:    pm2 stop chatandtip
 * Delete:  pm2 delete chatandtip
 * Logs:    pm2 logs chatandtip
 * Save:    pm2 save   (persist across reboots)
 *
 * NOTE: This file reads .env at pm2-start time and injects every var
 * into PM2's env block so all cluster workers receive them — no dotenv
 * required inside server.mjs, and no secrets hardcoded here.
 */

const fs   = require("node:fs")
const path = require("node:path")

// ── Parse .env → plain object ──────────────────────────────────────────────
function parseEnvFile(filePath) {
  try {
    return Object.fromEntries(
      fs.readFileSync(filePath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const eq = line.indexOf("=")
          const key = line.slice(0, eq).trim()
          const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
          return [key, val]
        }),
    )
  } catch {
    console.warn("[ecosystem] .env not found — relying on process environment")
    return {}
  }
}

const dotEnv = parseEnvFile(path.join(__dirname, ".env"))

// ── App definition ──────────────────────────────────────────────────────────
module.exports = {
  apps: [
    {
      name: "chatandtip",

      // Custom WebSocket-aware server (wraps Next.js + ws server on /ws/mobile)
      script: "server.mjs",
      cwd: "/www/wwwroot/chatandtip-web",

      // ── Cluster mode ───────────────────────────────────────────────
      // 4 workers on an 8-core machine — leaves headroom for MySQL,
      // Redis, Nginx, and other PM2 processes.
      // Redis pub/sub in server.mjs fans out WebSocket events across
      // all workers: message handled by worker N reaches a user whose
      // WebSocket is on worker M via the Redis subscription.
      instances: 4,
      exec_mode: "cluster",

      // ── Environment ────────────────────────────────────────────────
      // .env vars are spread here so every worker gets them. PM2 stores
      // these in its daemon — workers receive them via process.env.
      env: {
        NODE_ENV: "production",
        PORT: "3006",
        ...dotEnv,              // spreads DATABASE_URL, JWT_SECRET, REDIS_URL, etc.
      },

      // ── Restart policy ─────────────────────────────────────────────
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",        // must stay alive 10 s to count as a clean start
      restart_delay: 2000,      // wait 2 s between crash restarts

      // ── Memory guard ──────────────────────────────────────────────
      max_memory_restart: "512M",

      // ── Logging ───────────────────────────────────────────────────
      out_file: "/root/.pm2/logs/chatandtip-out.log",
      error_file: "/root/.pm2/logs/chatandtip-error.log",
      merge_logs: true,         // all 4 worker logs merged into one file
      log_date_format: "YYYY-MM-DD HH:mm:ss",

      // ── Graceful shutdown ──────────────────────────────────────────
      kill_timeout: 8000,       // time for server to close WS connections
      listen_timeout: 15000,
      wait_ready: false,
    },
  ],
}
