import "server-only"

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { LoginProvider } from "@prisma/client"
import { env } from "@/lib/env"

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"))

type VerifiedProviderIdentity = {
  provider: LoginProvider
  providerUserId: string
  email?: string
  emailVerified: boolean
}

function parseCsv(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function readStringClaim(payload: JWTPayload, key: string) {
  const value = payload[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readBooleanClaim(payload: JWTPayload, key: string) {
  const value = payload[key]
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

async function verifyGoogleIdToken(idToken: string): Promise<VerifiedProviderIdentity> {
  const audiences = parseCsv(env.GOOGLE_OAUTH_CLIENT_IDS)
  if (audiences.length === 0) {
    throw new Error("Google sign-in is not configured on the server")
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: audiences,
  })

  const providerUserId = payload.sub
  if (!providerUserId) {
    throw new Error("Google token is missing a subject")
  }

  return {
    provider: LoginProvider.GOOGLE,
    providerUserId,
    email: readStringClaim(payload, "email"),
    emailVerified: readBooleanClaim(payload, "email_verified"),
  }
}

async function verifyAppleIdentityToken(identityToken: string): Promise<VerifiedProviderIdentity> {
  const audiences = parseCsv(env.APPLE_OAUTH_AUDIENCES)
  if (audiences.length === 0) {
    throw new Error("Apple sign-in is not configured on the server")
  }

  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: audiences,
  })

  const providerUserId = payload.sub
  if (!providerUserId) {
    throw new Error("Apple identity token is missing a subject")
  }

  return {
    provider: LoginProvider.APPLE,
    providerUserId,
    email: readStringClaim(payload, "email"),
    emailVerified: readBooleanClaim(payload, "email_verified"),
  }
}

export async function verifyMobileProviderToken(input: {
  provider: LoginProvider
  idToken: string
}) {
  if (input.provider === LoginProvider.GOOGLE) {
    return verifyGoogleIdToken(input.idToken)
  }

  return verifyAppleIdentityToken(input.idToken)
}
