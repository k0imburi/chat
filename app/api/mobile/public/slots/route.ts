import { BookingType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { availableSlots } from '@/lib/mobile-bookings'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const creatorId = params.get('creatorId') || ''
  const type = params.get('type')?.toUpperCase() as BookingType
  if (!creatorId || creatorId.length > 100 || !['VOICE', 'VIDEO'].includes(type)) {
    return NextResponse.json({ success: false, message: 'creatorId and type are required' }, { status: 400 })
  }
  const creator = await prisma.user.findFirst({ where: { id: creatorId, isActive: true, status: 'ACTIVE' }, select: { id: true } })
  if (!creator) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true, data: await availableSlots(creatorId, type) }, { headers: { 'Cache-Control': 'no-store' } })
}
