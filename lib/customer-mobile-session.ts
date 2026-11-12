import { getCustomerSession } from "@/lib/customer-auth"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

export async function getCustomerOrMobileSession(request: Request) {
  const mobile = await getMobileSessionFromRequest(request)
  if (mobile) return mobile
  const customer = await getCustomerSession()
  return customer?.userId ? { userId: customer.userId, loginProvider: "web" } : null
}
