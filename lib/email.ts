import "server-only"

import nodemailer from "nodemailer"
import { getNotificationSettings } from "@/lib/notification-settings"

type SendMailInput = {
  to: string | string[]
  subject: string
  text: string
  html?: string
}

export async function sendEmail(input: SendMailInput) {
  const config = await getNotificationSettings()
  if (!config.email.enabled) {
    return { success: false as const, reason: "disabled" as const }
  }

  if (!config.email.host || !config.email.user || !config.email.password || !config.email.fromAddress) {
    return { success: false as const, reason: "misconfigured" as const }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    })

    await transporter.sendMail({
      from: config.email.fromName
        ? `"${config.email.fromName}" <${config.email.fromAddress}>`
        : config.email.fromAddress,
      to: Array.isArray(input.to) ? input.to.join(", ") : input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })

    return { success: true as const }
  } catch (error) {
    return {
      success: false as const,
      reason: "exception" as const,
      error: error instanceof Error ? error.message : "Unknown email error",
    }
  }
}
