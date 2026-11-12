import { prisma } from "@/lib/prisma"

function selectedUrl(
  media: { url: string; thumbnailUrl: string | null; images: unknown },
  requestUrl: string,
) {
  const search = new URL(requestUrl).searchParams
  const asset = search.get("asset") ?? "primary"
  if (asset === "thumbnail") return media.thumbnailUrl || media.url
  if (asset === "image") {
    const images = Array.isArray(media.images)
      ? media.images.map(String).filter(Boolean)
      : []
    const index = Math.max(0, Number.parseInt(search.get("index") ?? "0", 10) || 0)
    return images[index] || media.url
  }
  return media.url
}

/**
 * Same-origin stream for public profile/feed media.
 *
 * R2's public development domain does not emit browser CORS headers. Native
 * apps can load it directly, but Flutter web cannot reliably decode those
 * images/videos. Resolve the URL from our own database (never from caller
 * input) and relay range requests through the ChatAndTip origin.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const media = await prisma.userMedia.findUnique({
    where: { id },
    select: {
      url: true,
      thumbnailUrl: true,
      images: true,
      kind: true,
      copyrightStatus: true,
      reportStatus: true,
      isHiddenByOwner: true,
      user: { select: { isActive: true, status: true } },
    },
  })

  const allowedKind =
    media?.kind === "GALLERY_VIDEO" ||
    media?.kind === "IMAGE" ||
    media?.kind === "PROFILE_VIDEO" ||
    media?.kind === "PROFILE_IMAGE"
  if (
    !media ||
    !allowedKind ||
    !media.user.isActive ||
    ["BLOCKED", "HIDDEN"].includes(media.user.status) ||
    media.isHiddenByOwner ||
    media.copyrightStatus ||
    media.reportStatus
  ) {
    return new Response("Not found", { status: 404 })
  }

  const target = selectedUrl(media, request.url)
  if (!target.startsWith("https://")) {
    return new Response("Not found", { status: 404 })
  }

  const range = request.headers.get("range")
  const upstream = await fetch(target, {
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Media unavailable", { status: upstream.status })
  }

  const headers = new Headers()
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")
  return new Response(upstream.body, { status: upstream.status, headers })
}
