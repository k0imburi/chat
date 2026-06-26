import "server-only"

import { createHash, randomInt } from "node:crypto"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { sendEmail } from "@/lib/email"
import { getNotificationSettings } from "@/lib/notification-settings"
import { prisma } from "@/lib/prisma"
import { sendSms } from "@/lib/sms"

type OtpInput = {
  recipient: string
  channel: VerificationChannel
  purpose: VerificationPurpose
  userId?: string
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function buildOtp(length: number) {
  const digits = Array.from({ length }, () => randomInt(0, 10).toString()).join("")
  return digits
}

export async function createVerificationCode(input: OtpInput) {
  const config = await getNotificationSettings()
  const code = buildOtp(config.auth.otpLength)
  const expiresAt = new Date(Date.now() + config.auth.otpExpiryMinutes * 60 * 1000)

  await prisma.verificationCode.updateMany({
    where: {
      recipient: input.recipient,
      channel: input.channel,
      purpose: input.purpose,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  })

  await prisma.verificationCode.create({
    data: {
      userId: input.userId,
      recipient: input.recipient,
      channel: input.channel,
      purpose: input.purpose,
      codeHash: hashValue(code),
      expiresAt,
    },
  })

  return { code, expiresAt }
}

export async function consumeVerificationCode(input: {
  recipient: string
  channel: VerificationChannel
  purpose: VerificationPurpose
  code: string
}) {
  const record = await prisma.verificationCode.findFirst({
    where: {
      recipient: input.recipient,
      channel: input.channel,
      purpose: input.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  })

  if (!record || record.codeHash !== hashValue(input.code.trim())) {
    if (record) {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      })
    }

    return null
  }

  const consumed = await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  return consumed
}

export async function sendOtpNotification(input: OtpInput) {
  const { code, expiresAt } = await createVerificationCode(input)
  const settings = await getNotificationSettings()
  const appName = settings.appName
  const minutes = settings.auth.otpExpiryMinutes
  const message = input.purpose === VerificationPurpose.PHONE_LOGIN
    ? `${appName}: Your verification code is ${code}. It expires in ${minutes} minutes.`
    : input.purpose === VerificationPurpose.PAYOUT_PHONE
      ? `${appName}: Your M-PESA payout verification code is ${code}. It expires in ${minutes} minutes.`
      : `${appName}: Your password reset code is ${code}. It expires in ${minutes} minutes.`

  const result =
    input.channel === VerificationChannel.SMS
      ? await sendSms(input.recipient, message, input.purpose)
      : await sendEmail({
          to: input.recipient,
          subject: input.purpose === VerificationPurpose.PHONE_LOGIN ? `${appName} verification code` : `${appName} password reset code`,
          text: message,
          html: `<p>${message}</p>`,
        })

  return { success: result.success, result, expiresAt }
}

export async function sendPasswordResetNotifications(input: {
  email?: string | null
  phone?: string | null
  userId?: string
  fullName?: string | null
}) {
  const deliveries: Record<string, unknown> = {}

  if (input.email) {
    deliveries.email = await sendOtpNotification({
      recipient: input.email,
      channel: VerificationChannel.EMAIL,
      purpose: VerificationPurpose.PASSWORD_RESET,
      userId: input.userId,
    })
  }

  if (input.phone) {
    deliveries.sms = await sendOtpNotification({
      recipient: input.phone,
      channel: VerificationChannel.SMS,
      purpose: VerificationPurpose.PASSWORD_RESET,
      userId: input.userId,
    })
  }

  return deliveries
}

export async function sendPaymentNotification(input: {
  email?: string | null
  phone?: string | null
  fullName?: string | null
  amount: number
  currency?: string
  reference?: string
  subject?: string
  message?: string
}) {
  const settings = await getNotificationSettings()
  const appName = settings.appName
  const currency = input.currency || "KES"
  const name = input.fullName?.trim() || "User"
  const message =
    input.message ||
    `${appName}: Hello ${name}, your payment of ${currency} ${input.amount.toFixed(2)} has been received${input.reference ? ` (Ref: ${input.reference})` : ""}.`

  const deliveries: Record<string, unknown> = {}

  if (input.phone) {
    deliveries.sms = await sendSms(input.phone, message, "Payment")
  }

  if (input.email) {
    deliveries.email = await sendEmail({
      to: input.email,
      subject: input.subject || `${appName} payment confirmation`,
      text: message,
      html: `<p>${message}</p>`,
    })
  }

  return deliveries
}
