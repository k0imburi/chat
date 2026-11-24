import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session"
import { prisma } from "@/lib/prisma"
import { watermarkImage, watermarkVideo } from "@/lib/watermark-download"

export const runtime = "nodejs"
const limit = 100 * 1024 * 1024
let active = 0

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCustomerOrMobileSession(request)
  if (!session?.userId) return new Response("Unauthorized", { status: 401 })
  const { id } = await context.params
  const media = await prisma.userMedia.findUnique({ where: { id }, include: { user: { select: { username: true, allowPostDownloads: true, isActive: true, status: true } } } })
  if (!media || !["GALLERY_VIDEO", "IMAGE", "PROFILE_VIDEO", "PROFILE_IMAGE"].includes(media.kind) || !media.user.isActive || ["BLOCKED", "HIDDEN"].includes(media.user.status) || media.isHiddenByOwner || media.copyrightStatus || media.reportStatus) return new Response("Not found", { status: 404 })
  if (!media.user.allowPostDownloads) return new Response("Downloads disabled", { status: 403 })
  const isImage = ["IMAGE", "PROFILE_IMAGE"].includes(media.kind)
  const images = Array.isArray(media.images) ? media.images.filter((v): v is string => typeof v === "string" && v.length > 0) : []
  const indexText = new URL(request.url).searchParams.get("index") || "0"
  if (!/^\d+$/.test(indexText)) return new Response("Invalid index", { status: 400 })
  const index = Number(indexText)
  const target = isImage && images.length ? images[index] : index === 0 ? media.url : undefined
  if (!target?.startsWith("https://")) return new Response("Not found", { status: 404 })
  if (active >= 2) return new Response("Please try again shortly", { status: 503 })
  active++
  try {
    const upstream = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(60000) })
    if (!upstream.ok || !upstream.body) throw new Error("Media unavailable")
    if (Number(upstream.headers.get("content-length")) > limit) return new Response("Media too large", { status: 413 })
    const reader = upstream.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); return new Response("Media too large", { status: 413 }) }
      chunks.push(value)
    }
    const bytes = Buffer.concat(chunks)
    const output = isImage ? await watermarkImage(bytes, media.user.username || "creator") : await watermarkVideo(bytes, media.user.username || "creator")
    return new Response(new Uint8Array(output), { headers: { "Content-Type": isImage ? "image/jpeg" : "video/mp4", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    console.error("Watermarked download failed", error instanceof Error ? error.message : "unknown error")
    return new Response("Unable to prepare watermarked download", { status: 503 })
  } finally { active-- }
}
