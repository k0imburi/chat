"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { authenticateAdmin, signSessionToken, toSessionUser } from "@/lib/auth"
import { SESSION_COOKIE } from "@/lib/constants"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export type LoginActionState = {
  success: boolean
  message?: string
  redirectTo?: string
}

export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return { success: false, message: "Enter a valid email and password." }
  }

  const admin = await authenticateAdmin(parsed.data.email, parsed.data.password)

  if (!admin) {
    return { success: false, message: "Invalid admin credentials." }
  }

  const token = await signSessionToken(toSessionUser(admin))
  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })

  return { success: true, redirectTo: "/dashboard" }
}

export async function logoutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect("/login")
}
