import "server-only"

import { env } from "@/lib/env"

// Lazy-init so the module is safe to import when FIREBASE_SERVICE_ACCOUNT is absent.
let _ready = false
let _messaging: import("firebase-admin/messaging").Messaging | null = null

function getMessaging() {
  if (_ready) return _messaging
  _ready = true

  if (!env.FIREBASE_SERVICE_ACCOUNT) return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeApp, getApps, cert } = require("firebase-admin/app") as typeof import("firebase-admin/app")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging: _getMessaging } = require("firebase-admin/messaging") as typeof import("firebase-admin/messaging")

    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) })
    }
    _messaging = _getMessaging()
    return _messaging
  } catch (err) {
    console.error("[fcm] Failed to initialise Firebase Admin:", err)
    return null
  }
}

export type FcmPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

/** Send to a single device token. Returns true on success. */
export async function sendFcmPush(token: string, payload: FcmPayload): Promise<boolean> {
  const messaging = getMessaging()
  if (!messaging || !token) return false
  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    })
    return true
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") return false
    console.error("[fcm] sendFcmPush error:", err)
    return false
  }
}

/** Send to many tokens in batches of 500. Returns success count. */
export async function sendFcmMulticast(tokens: string[], payload: FcmPayload): Promise<number> {
  const messaging = getMessaging()
  if (!messaging || !tokens.length) return 0
  const BATCH = 500
  let sent = 0
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH).filter(Boolean)
    if (!batch.length) continue
    try {
      const result = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      })
      sent += result.successCount
    } catch (err) {
      console.error("[fcm] sendFcmMulticast batch error:", err)
    }
  }
  return sent
}
