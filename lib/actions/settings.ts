"use server"

import { UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { hashPassword, requireSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const generalSchema = z.object({
  appName: z.string().min(2),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().min(3),
  minimumTip: z.coerce.number().min(0),
  transactionFeePercent: z.coerce.number().min(0),
  usdToKesRate: z.coerce.number().min(0),
  freeMemberSwipeLimit: z.coerce.number().int().min(0),
  showDiscoverAdAfterSwipes: z.coerce.number().int().min(0),
  maxVideosUpload: z.coerce.number().int().min(1),
  allowVideoModeration: z.coerce.boolean().optional(),
  showAds: z.coerce.boolean().optional(),
  allowFreeAccess: z.coerce.boolean().optional(),
  allowVideoCall: z.coerce.boolean().optional(),
  allowVoiceCall: z.coerce.boolean().optional(),
  allowSendImages: z.coerce.boolean().optional(),
  mpesaConsumerKey: z.string().optional(),
  mpesaConsumerSecret: z.string().optional(),
  mpesaPasskey: z.string().optional(),
  mpesaShortcode: z.string().optional(),
  mpesaStoreNumber: z.string().optional(),
  mpesaShortcodeType: z.string().optional(),
  mpesaEnvironment: z.string().optional(),
  paypalClientId: z.string().optional(),
  paypalClientSecret: z.string().optional(),
  jwtExpiry: z.string().min(2),
})

const r2Schema = z.object({
  r2AccountId: z.string().optional(),
  r2AccessKeyId: z.string().optional(),
  r2SecretAccessKey: z.string().optional(),
  r2BucketName: z.string().optional(),
  r2PublicBaseUrl: z.string().optional(),
  r2Region: z.string().optional(),
  r2Endpoint: z.string().optional(),
})

const notificationSchema = z.object({
  emailEnabled: z.coerce.boolean().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().int().min(1),
  smtpSecure: z.coerce.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpFromAddress: z.string().optional(),
  smtpFromName: z.string().optional(),
  smsEnabled: z.coerce.boolean().optional(),
  smsApiUrl: z.string().url().or(z.literal("")),
  smsUserId: z.string().optional(),
  smsPassword: z.string().optional(),
  smsSenderId: z.string().optional(),
  otpLength: z.coerce.number().int().min(4).max(8),
  otpExpiryMinutes: z.coerce.number().int().min(1).max(60),
  passwordResetExpiryMinutes: z.coerce.number().int().min(1).max(120),
})

const adminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(UserRole),
})

export async function saveGeneralSettingsAction(formData: FormData) {
  await requireSessionUser()
  const parsed = generalSchema.parse({
    appName: formData.get("appName"),
    contactEmail: formData.get("contactEmail") || "",
    contactPhone: formData.get("contactPhone") || "",
    address: formData.get("address") || "",
    currency: formData.get("currency"),
    minimumTip: formData.get("minimumTip"),
    transactionFeePercent: formData.get("transactionFeePercent"),
    usdToKesRate: formData.get("usdToKesRate"),
    freeMemberSwipeLimit: formData.get("freeMemberSwipeLimit"),
    showDiscoverAdAfterSwipes: formData.get("showDiscoverAdAfterSwipes"),
    maxVideosUpload: formData.get("maxVideosUpload"),
    allowVideoModeration: formData.get("allowVideoModeration") === "on",
    showAds: formData.get("showAds") === "on",
    allowFreeAccess: formData.get("allowFreeAccess") === "on",
    allowVideoCall: formData.get("allowVideoCall") === "on",
    allowVoiceCall: formData.get("allowVoiceCall") === "on",
    allowSendImages: formData.get("allowSendImages") === "on",
    mpesaConsumerKey: formData.get("mpesaConsumerKey") || "",
    mpesaConsumerSecret: formData.get("mpesaConsumerSecret") || "",
    mpesaPasskey: formData.get("mpesaPasskey") || "",
    mpesaShortcode: formData.get("mpesaShortcode") || "",
    mpesaStoreNumber: formData.get("mpesaStoreNumber") || "",
    mpesaShortcodeType: formData.get("mpesaShortcodeType") || "CustomerPayBillOnline",
    mpesaEnvironment: formData.get("mpesaEnvironment") || "sandbox",
    paypalClientId: formData.get("paypalClientId") || "",
    paypalClientSecret: formData.get("paypalClientSecret") || "",
    jwtExpiry: formData.get("jwtExpiry") || "7d",
  })

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: parsed,
    create: { id: 1, ...parsed },
  })

  revalidatePath("/settings")
  revalidatePath("/dashboard")
}

export async function saveR2SettingsAction(formData: FormData) {
  await requireSessionUser()
  const parsed = r2Schema.parse({
    r2AccountId: formData.get("r2AccountId") || "",
    r2AccessKeyId: formData.get("r2AccessKeyId") || "",
    r2SecretAccessKey: formData.get("r2SecretAccessKey") || "",
    r2BucketName: formData.get("r2BucketName") || "",
    r2PublicBaseUrl: formData.get("r2PublicBaseUrl") || "",
    r2Region: formData.get("r2Region") || "auto",
    r2Endpoint: formData.get("r2Endpoint") || "",
  })

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: parsed,
    create: { id: 1, appName: "ChatAndTip", currency: "USD", jwtExpiry: "7d", ...parsed },
  })

  revalidatePath("/settings")
}

export async function saveNotificationSettingsAction(formData: FormData) {
  await requireSessionUser()
  const parsed = notificationSchema.parse({
    emailEnabled: formData.get("emailEnabled") === "on",
    smtpHost: formData.get("smtpHost") || "",
    smtpPort: formData.get("smtpPort") || 587,
    smtpSecure: formData.get("smtpSecure") === "on",
    smtpUser: formData.get("smtpUser") || "",
    smtpPassword: formData.get("smtpPassword") || "",
    smtpFromAddress: formData.get("smtpFromAddress") || "",
    smtpFromName: formData.get("smtpFromName") || "",
    smsEnabled: formData.get("smsEnabled") === "on",
    smsApiUrl: formData.get("smsApiUrl") || "",
    smsUserId: formData.get("smsUserId") || "",
    smsPassword: formData.get("smsPassword") || "",
    smsSenderId: formData.get("smsSenderId") || "",
    otpLength: formData.get("otpLength") || 6,
    otpExpiryMinutes: formData.get("otpExpiryMinutes") || 10,
    passwordResetExpiryMinutes: formData.get("passwordResetExpiryMinutes") || 15,
  })

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: parsed,
    create: { id: 1, appName: "ChatAndTip", currency: "USD", jwtExpiry: "7d", ...parsed },
  })

  revalidatePath("/settings")
}

export async function createAdminUserAction(formData: FormData) {
  await requireSessionUser()
  const parsed = adminSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  })

  await prisma.user.create({
    data: {
      fullName: parsed.name,
      email: parsed.email,
      passwordHash: await hashPassword(parsed.password),
      role: parsed.role,
      isActive: true,
      gender: "",
    },
  })

  revalidatePath("/settings")
}
