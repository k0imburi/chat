import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { SESSION_COOKIE } from "@/lib/constants"

const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout", "/checkout", "/tip", "/reels"]

// These path prefixes bypass the admin session check entirely.
// Mobile API routes authenticate via their own Bearer token; webhooks
// and app-info are unauthenticated public endpoints. The checkout API
// authenticates via a one-time checkout token.
const bypassPrefixes = [
  "/api/mobile/",
  "/api/v1/",
  "/api/app-info",
  "/api/lnmo/",
  "/api/checkout/",
  "/api/tip/",
  "/api/stripe/",
  "/api/mpesa/",
  "/api/jobs/",
]

const adminPrefixes = [
  "/dashboard", "/users", "/reports", "/wallets", "/withdrawals",
  "/tip-requests", "/chats", "/assets", "/explore-insights",
  "/verification-logs", "/payment-plans", "/notifications", "/settings",
  "/payment-reconciliation", "/creator-verifications", "/held-tips",
  "/booking-reviews", "/creator-payouts",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get("host")?.split(":")[0]?.toLowerCase() || ""
  const adminHost = (process.env.ADMIN_HOST || "admin.chatandtip.com").toLowerCase()
  const customerHost = (process.env.CUSTOMER_HOST || "www.chatandtip.com").toLowerCase()
  const apexHost = (process.env.ROOT_HOST || "chatandtip.com").toLowerCase()
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1"
  const isCustomerHost = hostname === customerHost || hostname === apexHost
  const isAdminHost = !isCustomerHost && (hostname === adminHost || hostname === "admin.localhost" || (isLocal && request.nextUrl.searchParams.get("surface") === "admin"))
  const isAdminPath = adminPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  const adminOnlyApi = ["/api/admin/"]
  const customerOnlyApi = ["/api/v1/", "/api/mobile/", "/api/app-info", "/api/lnmo/", "/api/checkout/", "/api/tip/", "/api/stripe/", "/api/mpesa/", "/api/jobs/"]
  const customerPagePrefixes = ["/wallet", "/inbox", "/alerts", "/account", "/profiles", "/trending", "/reels", "/sessions", "/availability", "/book", "/create"]

  if (!isAdminHost && isAdminPath) return new NextResponse("Not found", { status: 404 })
  if (!isAdminHost && adminOnlyApi.some((prefix) => pathname.startsWith(prefix))) return new NextResponse("Not found", { status: 404 })
  if (isAdminHost && customerOnlyApi.some((prefix) => pathname.startsWith(prefix))) return new NextResponse("Not found", { status: 404 })
  if (!isAdminHost && pathname.startsWith("/api/auth/")) return new NextResponse("Not found", { status: 404 })
  if (isAdminHost && pathname === "/") return NextResponse.redirect(new URL("/dashboard", request.url))
  if (isAdminHost && ["/checkout", "/tip"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return new NextResponse("Not found", { status: 404 })
  }
  if (isAdminHost && customerPagePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return new NextResponse("Not found", { status: 404 })
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    bypassPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next()
  }

  const isPublic = (!isAdminHost && pathname === "/") || publicRoutes.some((route) => pathname === route) || pathname.startsWith("/reels/")
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (isPublic) {
    if (isAdminHost && pathname === "/login" && token) {
      try {
        await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET))
        return NextResponse.redirect(new URL("/dashboard", request.url))
      } catch {
        return NextResponse.next()
      }
    }
    return NextResponse.next()
  }

  if (!isAdminHost) return NextResponse.next()

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
