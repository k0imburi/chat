import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { searchMobileUsers, serializeMobileUser } from "@/lib/mobile-users"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const q = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (q.length < 2) return NextResponse.json({ success: true, data: { users: [], posts: [] } })
  const [users, media] = await Promise.all([
    searchMobileUsers(q, 30),
    prisma.userMedia.findMany({
      where: {
        kind: { in: ["GALLERY_VIDEO", "IMAGE"] }, isHiddenByOwner: false,
        copyrightStatus: null, reportStatus: null,
        user: {
          isActive: true,
          status: { notIn: ["BLOCKED", "HIDDEN"] },
          OR: [{ externalId: null }, { externalId: { not: { startsWith: "system:" } } }],
        },
        OR: [{ title: { contains: q } }, { caption: { contains: q } }, { description: { contains: q } }],
      },
      include: { user: { include: { media: true } } }, take: 30, orderBy: { createdAt: "desc" },
    }),
  ])
  const posts = media.map((item) => {
    const owner = serializeMobileUser(item.user)
    const post = owner.gallery.find((entry) => entry.id === item.id)
    return post ? { user: { ...owner, gallery: [] }, video: post } : null
  })
  return NextResponse.json({ success: true, data: {
    users: users.map(serializeMobileUser), posts: posts.filter(Boolean),
  } })
}
