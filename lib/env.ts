import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  MOBILE_JWT_EXPIRES_IN: z.string().default("30d"),
  GOOGLE_OAUTH_CLIENT_IDS: z.string().optional(),
  APPLE_OAUTH_AUDIENCES: z.string().optional(),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@chatandtip.local"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("123456"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  R2_REGION: z.string().default("auto"),
  R2_ENDPOINT: z.string().optional(),
  EMAIL_ENABLED: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_ADDRESS: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMS_ENABLED: z.string().optional(),
  SMS_API_URL: z.string().optional(),
  SMS_USER_ID: z.string().optional(),
  SMS_PASSWORD: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  OTP_LENGTH: z.coerce.number().optional(),
  OTP_EXPIRY_MINUTES: z.coerce.number().optional(),
  PASSWORD_RESET_EXPIRY_MINUTES: z.coerce.number().optional(),
  APP_URL: z.string().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("ChatAndTip Admin"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors)
  throw new Error("Invalid environment variables")
}

export const env = parsed.data
