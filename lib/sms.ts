import "server-only"

import { getNotificationSettings } from "@/lib/notification-settings"

export function normalizePhoneNumber(phone?: string | null) {
  if (!phone) return null
  const digits = String(phone).trim().replace(/\D/g, "")
  if (digits.startsWith("254") && digits.length === 12) return digits
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`
  if (digits.length === 9) return `254${digits}`
  return null
}

function sanitizeMessage(message: string) {
  return message
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€¦/g, "...")
    .replace(/[^\x00-\x7F]/g, "")
}

function normalizeRecipients(to: string | string[]) {
  const values = Array.isArray(to) ? to : String(to).split(",")
  const formatted = values.map((value) => normalizePhoneNumber(value)).filter(Boolean)
  return formatted.length ? formatted.join(",") : null
}

export async function sendSms(to: string | string[], message: string, sender = "System") {
  const config = await getNotificationSettings()
  if (!config.sms.enabled) {
    return { success: false as const, reason: "disabled" as const }
  }

  const formatted = normalizeRecipients(to)
  if (!formatted) {
    return { success: false as const, reason: "invalid-recipient" as const }
  }

  if (!config.sms.userId || !config.sms.password || !config.sms.senderId) {
    return { success: false as const, reason: "misconfigured" as const }
  }

  const payload = {
    userid: config.sms.userId,
    password: config.sms.password,
    senderid: config.sms.senderId,
    sendMethod: "quick",
    msgType: "text",
    output: "json",
    duplicatecheck: "false",
    msg: sanitizeMessage(message),
    mobile: formatted,
  }

  try {
    const response = await fetch(config.sms.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(payload),
      cache: "no-store",
    })

    const responseText = await response.text()
    if (!response.ok) {
      return { success: false as const, reason: "provider-error" as const, response: responseText }
    }

    try {
      return { success: true as const, sender, response: JSON.parse(responseText) }
    } catch {
      return { success: true as const, sender, response: responseText }
    }
  } catch (error) {
    return {
      success: false as const,
      reason: "exception" as const,
      error: error instanceof Error ? error.message : "Unknown SMS error",
    }
  }
}
