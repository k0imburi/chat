import "server-only"
import { requireSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function requireSupportAdmin() {
  const session = await requireSessionUser()
  const admin = await prisma.user.findFirst({
    where: { id: session.id, isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN", "SUPPORT"] } },
    select: { id: true },
  })
  if (!admin) throw new Error("Administrator access required")
  return admin
}
