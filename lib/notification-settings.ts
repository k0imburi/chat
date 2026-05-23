import "server-only"

import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"

function envBool(value?: string) {
  return value === "true" || value === "1"
}

export async function getNotificationSettings() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  return {
    appName: settings?.appName || "ChatAndTip",
    email: {
      enabled: settings?.emailEnabled ?? envBool(env.EMAIL_ENABLED),
      host: settings?.smtpHost || env.SMTP_HOST || "",
      port: settings?.smtpPort || env.SMTP_PORT || 587,
      secure: settings?.smtpSecure ?? envBool(env.SMTP_SECURE),
      user: settings?.smtpUser || env.SMTP_USER || "",
      password: settings?.smtpPassword || env.SMTP_PASSWORD || "",
      fromAddress: settings?.smtpFromAddress || env.SMTP_FROM_ADDRESS || "",
      fromName: settings?.smtpFromName || env.SMTP_FROM_NAME || "ChatAndTip",
    },
    sms: {
      enabled: settings?.smsEnabled ?? envBool(env.SMS_ENABLED),
      apiUrl: settings?.smsApiUrl || env.SMS_API_URL || "https://smsportal.hostpinnacle.co.ke/SMSApi/send",
      userId: settings?.smsUserId || env.SMS_USER_ID || "",
      password: settings?.smsPassword || env.SMS_PASSWORD || "",
      senderId: settings?.smsSenderId || env.SMS_SENDER_ID || "",
    },
    auth: {
      otpLength: settings?.otpLength || env.OTP_LENGTH || 6,
      otpExpiryMinutes: settings?.otpExpiryMinutes || env.OTP_EXPIRY_MINUTES || 10,
      passwordResetExpiryMinutes:
        settings?.passwordResetExpiryMinutes || env.PASSWORD_RESET_EXPIRY_MINUTES || 15,
    },
  }
}
