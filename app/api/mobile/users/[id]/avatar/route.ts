import { prisma } from "@/lib/prisma"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      avatarUrl: true, isActive: true, status: true,
      media: {
        where: { kind: { in: ["PROFILE_IMAGE", "PROFILE_VIDEO"] },
          isHiddenByOwner: false, copyrightStatus: null, reportStatus: null },
        select: { kind: true, url: true, thumbnailUrl: true },
        orderBy: { createdAt: "desc" }, take: 3,
      },
    },
  })
  if (!user?.isActive || ["BLOCKED", "HIDDEN"].includes(user.status)) {
    return new Response("Not found", { status: 404 })
  }
  const candidates = [...new Set([
    user.avatarUrl,
    ...user.media.flatMap(media => [media.thumbnailUrl,
      ...(media.kind === "PROFILE_IMAGE" ? [media.url] : [])]),
  ].filter((url): url is string => Boolean(url?.startsWith("https://"))))]
  for (const url of candidates) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
      const contentType = response.headers.get("content-type") || ""
      if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
        await response.body?.cancel()
        continue
      }
      return new Response(response.body, { headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      } })
    } catch { /* Try the next stored profile image. */ }
  }
  return new Response("Profile image unavailable", { status: 404 })
}
