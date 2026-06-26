import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { SESSION_COOKIE } from "@/lib/constants"

const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout", "/checkout"]

// These path prefixes bypass the admin session check entirely.
// Mobile API routes authenticate via their own Bearer token; webhooks
// and app-info are unauthenticated public endpoints. The checkout API
// authenticates via a one-time checkout token.
const bypassPrefixes = [
  "/api/mobile/",
  "/api/app-info",
  "/api/lnmo/",
  "/api/checkout/",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    bypassPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next()
  }

  const isPublic = publicRoutes.some((route) => pathname === route)
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (isPublic) {
    if (pathname === "/login" && token) {
      try {
        await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))
        return NextResponse.redirect(new URL("/dashboard", request.url))
      } catch {
        return NextResponse.next()
      }
    }
    return NextResponse.next()
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))
    return NextResponse.next()
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete(SESSION_COOKIE)
    return response
  }
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)"],
}
