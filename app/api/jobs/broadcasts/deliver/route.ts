import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { broadcastCampaignNotifications } from "@/lib/mobile-notifications"

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false }, { status: 401 })
  const campaign = await prisma.notificationCampaign.findFirst({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" } })
  if (!campaign) return NextResponse.json({ success: true, data: { idle: true } })
  const metadata = campaign.metadata && typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata) ? campaign.metadata as Record<string, unknown> : {}
  try {
    const delivered = await broadcastCampaignNotifications({
      title: campaign.title, message: campaign.message, campaignId: campaign.id,
      channel: campaign.channel, afterUserId: typeof metadata.lastUserId === "string" ? metadata.lastUserId : undefined, batchSize: 200,
    })
    const complete = delivered.created < 200
    await prisma.notificationCampaign.update({ where: { id: campaign.id }, data: {
      status: complete ? "SENT" : "DRAFT", sentAt: complete ? new Date() : null,
      metadata: { ...metadata, deliveryState: complete ? "SENT" : "DELIVERING", lastUserId: delivered.lastUserId, delivered: Number(metadata.delivered || 0) + delivered.created } as Prisma.InputJsonValue,
    } })
    return NextResponse.json({ success: true, data: { campaignId: campaign.id, complete, ...delivered } })
  } catch (error) {
    await prisma.notificationCampaign.update({ where: { id: campaign.id }, data: { status: "FAILED", metadata: { ...metadata, deliveryState: "FAILED", error: error instanceof Error ? error.message : "Delivery failed" } as Prisma.InputJsonValue } })
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
