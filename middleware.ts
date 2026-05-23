import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { SESSION_COOKIE } from "@/lib/constants"

const publicRoutes = ["/login", "/api/auth/login", "/api/auth/logout"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
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
