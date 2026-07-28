import "server-only"

import * as http2 from "node:http2"
import { importPKCS8, SignJWT } from "jose"
import { env } from "@/lib/env"

let cachedToken: { value: string; expiresAt: number } | null = null

async function providerToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY) return null
  const key = await importPKCS8(env.APNS_PRIVATE_KEY.replaceAll("\\n", "\n"), "ES256")
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APNS_KEY_ID })
    .setIssuer(env.APNS_TEAM_ID)
    .setIssuedAt()
    .sign(key)
  cachedToken = { value, expiresAt: Date.now() + 50 * 60_000 }
  return value
}

export async function sendVoipPush(tokens: string[], payload: Record<string, unknown>) {
  const token = await providerToken()
  if (!token || !env.APNS_BUNDLE_ID || !tokens.length) return 0
  const authority = env.APNS_PRODUCTION === "false"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com"
  const client = http2.connect(authority)
  let sent = 0
  try {
    for (const deviceToken of [...new Set(tokens)]) {
      const success = await new Promise<boolean>((resolve) => {
        const request = client.request({
          ":method": "POST",
          ":path": `/3/device/${deviceToken}`,
          authorization: `bearer ${token}`,
          "apns-push-type": "voip",
          "apns-topic": `${env.APNS_BUNDLE_ID}.voip`,
          "apns-priority": "10",
          "apns-expiration": "0",
        })
        let status = 0
        request.on("response", (headers) => { status = Number(headers[":status"] ?? 0) })
        request.on("data", () => undefined)
        request.on("error", () => resolve(false))
        request.on("end", () => resolve(status === 200))
        request.end(JSON.stringify(payload))
      })
      if (success) sent += 1
    }
  } finally {
    client.close()
  }
  return sent
}
