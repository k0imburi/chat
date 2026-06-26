#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs"

const [, , envFile, ...command] = process.argv

if (!envFile || !command.length) {
  console.error("Usage: node scripts/with-env-file.mjs <env-file> <command> [...args]")
  process.exit(1)
}

function parseEnvFile(path) {
  if (!fs.existsSync(path)) {
    console.error(`Env file not found: ${path}`)
    process.exit(1)
  }
  const env = {}
  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    value = value.replace(/^["']|["']$/g, "")
    env[key] = value
  }
  return env
}

const child = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env: { ...process.env, ...parseEnvFile(envFile) },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
