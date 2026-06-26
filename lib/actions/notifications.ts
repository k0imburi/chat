"use server"

import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  errorResult,
  getActionFormData,
  successResult,
  type ActionResult,
} from "@/lib/actions/action-result"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { broadcastCampaignNotifications } from "@/lib/mobile-notifications"

const schema = z.object({
  title: z.string().optional(),
  message: z.string().min(3),
  channel: z.nativeEnum(NotificationChannel),
  scheduledAt: z.string().optional(), // ISO datetime string from the form
})

async function _runDelivery(campaignId: string) {
  const campaign = await prisma.notificationCampaign.findUniqueOrThrow({ where: { id: campaignId } })
  const meta = campaign.metadata && typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata)
    ? (campaign.metadata as Record<string, unknown>)
    : {}
  let lastUserId = typeof meta.lastUserId === "string" ? meta.lastUserId : undefined
  let totalDelivered = Number(meta.delivered ?? 0)
  const BATCH = 200

  while (true) {
    const result = await broadcastCampaignNotifications({
      title: campaign.title,
      message: campaign.message,
      campaignId: campaign.id,
      channel: campaign.channel,
      afterUserId: lastUserId,
      batchSize: BATCH,
    })
    totalDelivered += result.created
    const done = result.created < BATCH
    lastUserId = result.lastUserId ?? undefined
    await prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: {
        status: done ? NotificationStatus.SENT : NotificationStatus.DRAFT,
        sentAt: done ? new Date() : null,
        metadata: {
          ...meta,
          deliveryState: done ? "SENT" : "DELIVERING",
          lastUserId: lastUserId ?? null,
          delivered: totalDelivered,
        } as Prisma.InputJsonValue,
      },
    })
    if (done) break
  }
}

export async function createNotificationCampaignAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    const session = await requireSessionUser()
    const parsed = schema.parse({
      title: formData.get("title") || undefined,
      message: formData.get("message"),
      channel: formData.get("channel"),
      scheduledAt: formData.get("scheduledAt") || undefined,
    })

    const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt) : null
    const isScheduled = scheduledAt && scheduledAt > new Date()

    const campaign = await prisma.notificationCampaign.create({
      data: {
        title: parsed.title,
        message: parsed.message,
        channel: parsed.channel,
        status: NotificationStatus.DRAFT,
        scheduledAt,
        metadata: { deliveryState: isScheduled ? "SCHEDULED" : "DELIVERING" },
        createdById: session.id,
      },
    })

    if (!isScheduled) {
      await _runDelivery(campaign.id)
    }

    revalidatePath("/notifications")
    revalidatePath("/dashboard")
    return successResult(
      isScheduled
        ? `Campaign scheduled for ${scheduledAt!.toLocaleString()}.`
        : "Campaign delivered successfully.",
    )
  } catch (error) {
    return errorResult(error, "Unable to send notification campaign.")
  }
}

export async function deliverCampaignNowAction(campaignId: string) {
  try {
    await requireSessionUser()
    const campaign = await prisma.notificationCampaign.findUniqueOrThrow({ where: { id: campaignId } })
    if (campaign.status === NotificationStatus.SENT) {
      return successResult("Campaign was already delivered.")
    }
    await _runDelivery(campaignId)
    revalidatePath("/notifications")
    return successResult("Campaign delivered successfully.")
  } catch (error) {
    return errorResult(error, "Delivery failed.")
  }
}
