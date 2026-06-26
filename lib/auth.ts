import "server-only"

import bcrypt from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { UserRole, type User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { SESSION_COOKIE } from "@/lib/constants"

const secret = new TextEncoder().encode(env.JWT_SECRET)

export type SessionUser = {
  id: string
  email: string | null
  name: string
  role: UserRole
  avatarUrl: string | null
}

type SessionPayload = SessionUser & {
  exp?: number
  iat?: number
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function signSessionToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret)
}

export async function readSessionToken(token: string) {
  const { payload } = await jwtVerify<SessionPayload>(token, secret)
  return payload
}

export async function getSessionUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (!token) return null

  try {
    const payload = await readSessionToken(token)
    return payload
  } catch {
    return null
  }
}

export async function requireSessionUser() {
  const session = await getSessionUser()
  if (!session) redirect("/login")
  return session!
}

export async function authenticateAdmin(email: string, password: string) {
  const admin = await prisma.user.findFirst({
    where: {
      email,
      role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT] },
    },
  })

  if (!admin || !admin.isActive) return null
  if (!admin.passwordHash) return null

  const isValid = await verifyPassword(password, admin.passwordHash)
  if (!isValid) return null

  await prisma.user.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  })

  return admin
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    avatarUrl: user.avatarUrl,
  }
}
