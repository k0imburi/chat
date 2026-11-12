import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getComments, getReplies } from '@/lib/mobile-comments'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const mediaId = params.get('videoId') || ''
  const parentId = params.get('parentId')
  if (!mediaId) return NextResponse.json({ message: 'videoId is required' }, { status: 400 })
  const media = await prisma.userMedia.findFirst({ where: {
    id: mediaId, kind: { in: ['IMAGE', 'GALLERY_VIDEO'] }, adCampaignId: null,
    isHiddenByOwner: false, copyrightStatus: null, reportStatus: null,
    user: { isActive: true, status: 'ACTIVE' },
  }, select: { id: true } })
  if (!media) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  if (parentId) {
    const parent = await prisma.videoComment.findFirst({ where: { id: parentId, mediaId, parentId: null, isHidden: false }, select: { id: true } })
    if (!parent) return NextResponse.json({ message: 'Not found' }, { status: 404 })
    return NextResponse.json({ replies: await getReplies(parentId, '') })
  }
  return NextResponse.json(await getComments(mediaId, '', params.get('cursor') || undefined))
}
