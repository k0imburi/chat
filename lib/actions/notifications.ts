"use server"

import { NotificationChannel, NotificationStatus } from "@prisma/client"
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
})

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
    })

    const campaign = await prisma.notificationCampaign.create({
      data: {
        title: parsed.title,
        message: parsed.message,
        channel: parsed.channel,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        createdById: session.id,
      },
    })

    await broadcastCampaignNotifications({
      title: parsed.title,
      message: parsed.message,
      campaignId: campaign.id,
      channel: parsed.channel,
    })

    revalidatePath("/notifications")
    revalidatePath("/dashboard")
    return successResult("Notification campaign sent successfully.")
  } catch (error) {
    return errorResult(error, "Unable to send notification campaign.")
  }
}
