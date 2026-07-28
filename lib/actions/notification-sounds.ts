"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { errorResult, getActionFormData, successResult, type ActionResult } from "@/lib/actions/action-result"

const ASSET_KEYS = ["cat_pulse", "cat_ripple", "cat_glow", "cat_chime"] as const
const schema = z.object({
  assetKey: z.enum(ASSET_KEYS),
  displayName: z.string().min(2).max(40),
  description: z.string().max(100).optional(),
  sortOrder: z.coerce.number().int().min(0).max(100),
  isActive: z.boolean(),
  isDefault: z.boolean(),
})

export async function saveNotificationSoundAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    await requireSessionUser()
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    const input = schema.parse({
      assetKey: formData.get("assetKey"),
      displayName: formData.get("displayName"),
      description: formData.get("description") || "",
      sortOrder: formData.get("sortOrder") || 0,
      isActive: formData.get("isActive") === "on",
      isDefault: formData.get("isDefault") === "on",
    })
    const soundData = {
      assetKey: input.assetKey,
      displayName: input.displayName,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      isDefault: input.isDefault,
    }
    await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.notificationSound.updateMany({ data: { isDefault: false } })
      await tx.notificationSound.upsert({
        where: { assetKey: input.assetKey },
        create: soundData,
        update: {
          displayName: input.displayName,
          description: input.description,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          isDefault: input.isDefault,
        },
      })
    })
    revalidatePath("/notifications")
    return successResult("Notification sound saved.")
  } catch (error) {
    return errorResult(error, "Unable to save notification sound.")
  }
}
