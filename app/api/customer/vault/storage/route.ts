import { getCurrentCustomerUser } from "@/lib/customer-web"
import { vaultQuota } from "@/lib/vault-accounting"

export async function GET() {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return Response.json({ success: false, message: "Sign in required" }, { status: 401 })
  const quota = await vaultQuota(viewer.userId)
  return Response.json({ success: true, data: { percentage: quota.percentage } }, { headers: { "Cache-Control": "private, no-store" } })
}
