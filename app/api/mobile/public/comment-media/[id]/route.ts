import { prisma } from '@/lib/prisma'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const comment = await prisma.videoComment.findFirst({ where: {
    id, isHidden: false,
    OR: [{ parentId: null }, { parent: { isHidden: false } }],
    media: { kind: { in: ['IMAGE', 'GALLERY_VIDEO'] }, adCampaignId: null,
      isHiddenByOwner: false, copyrightStatus: null, reportStatus: null,
      user: { isActive: true, status: 'ACTIVE' } },
  }, select: { attachmentUrl: true } })
  if (!comment?.attachmentUrl?.startsWith('https://')) return new Response('Not found', { status: 404 })
  const asset = await prisma.asset.findFirst({ where: { url: comment.attachmentUrl, visibility: 'public' }, select: { id: true } })
  if (!asset) return new Response('Not found', { status: 404 })
  try {
    const source = await fetch(comment.attachmentUrl, { signal: AbortSignal.timeout(15000), redirect: 'manual' })
    const type = source.headers.get('content-type') || ''
    if (!source.ok || !type.toLowerCase().startsWith('image/')) return new Response('Image unavailable', { status: 404 })
    return new Response(source.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return new Response('Image unavailable', { status: 502 }) }
}
