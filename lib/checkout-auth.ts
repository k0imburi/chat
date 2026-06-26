import "server-only"

import { getCustomerSession } from "@/lib/customer-auth"
import { getCheckoutUserFromRequest } from "@/lib/mobile-session"

/**
 * Checkout can be reached in two supported ways:
 * - Flutter/mobile app opens a short-lived checkout token, then the website stores
 *   it in the httpOnly `chatandtip_checkout` cookie.
 * - Customer PWA user is already signed in on chatandtip.com.
 *
 * Keep both paths explicit so mobile top-up links keep working while the web app
 * can use /checkout and /tip as first-class app pages.
 */
export async function getCheckoutActorUserId(request: Request) {
  const tokenUserId = await getCheckoutUserFromRequest(request)
  if (tokenUserId) return tokenUserId

  const customer = await getCustomerSession()
  return customer?.userId ?? null
}
