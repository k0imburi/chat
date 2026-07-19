import "server-only"

import { prisma } from "@/lib/prisma"

// Letters, numbers, underscore only — matches the mobile onboarding screen's
// client-side regex. Length bounds are new (nothing enforced this before);
// 3-20 keeps it sane without being a real product decision either way.
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

export class InvalidUsernameError extends Error {
  constructor(message = "Username must be 3-20 characters: letters, numbers, and underscores only") {
    super(message)
    this.name = "InvalidUsernameError"
  }
}

export class UsernameTakenError extends Error {
  constructor() {
    super("Username already taken")
    this.name = "UsernameTakenError"
  }
}

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_REGEX.test(username)
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: { username, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  })
  return !existing
}

/**
 * Resolves what a user's `username` column should become given a requested
 * value, enforcing "settable once, then permanent":
 *  - Already has a username -> any requested change is silently ignored
 *    (returns undefined, meaning "leave it alone"). This isn't an error
 *    because callers that just resend the whole profile object shouldn't
 *    have to special-case an unchanged, already-locked field.
 *  - No username yet + a value was requested -> validate format, check
 *    uniqueness, and return the trimmed value to write.
 *  - No username yet + nothing requested -> undefined (still unset).
 *
 * Throws InvalidUsernameError / UsernameTakenError for a genuinely bad or
 * taken request on a first-time set — those should surface to the user.
 */
export async function resolveUsernameUpdate(
  existingUsername: string | null | undefined,
  requestedUsername: string | undefined,
  userId?: string,
): Promise<string | undefined> {
  if (existingUsername && existingUsername.trim()) return undefined
  if (requestedUsername === undefined) return undefined
  const trimmed = requestedUsername.trim()
  if (!trimmed) return undefined
  if (!isValidUsernameFormat(trimmed)) throw new InvalidUsernameError()
  if (!(await isUsernameAvailable(trimmed, userId))) throw new UsernameTakenError()
  return trimmed
}
