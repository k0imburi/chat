"use server"

import { AccountType, EntityVerificationStatus, UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionUser } from "@/lib/auth"
import { findMobileUserById, serializeMobileUser } from "@/lib/mobile-users"
import { createUserNotification } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"
import { emitChatRealtimeToUser } from "@/lib/realtime"

const reviewSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
})

export async function reviewEntityDocumentsAction(formData: FormData) {
  const session = await requireSessionUser()
  if (session.role !== UserRole.SUPER_ADMIN && session.role !== UserRole.ADMIN) {
    throw new Error("Administrator access required")
  }

  const input = reviewSchema.parse({
    userId: formData.get("userId"),
    decision: formData.get("decision"),
  })
  const approved = input.decision === "APPROVE"

  const entity = await prisma.user.findFirst({
    where: { id: input.userId, accountType: AccountType.ENTITY },
    select: { id: true, entityDocuments: true },
  })
  if (!entity) throw new Error("Entity account not found")
  if (!entity.entityDocuments) throw new Error("No entity documents were submitted")

  await prisma.user.update({
    where: { id: entity.id },
    data: approved
      ? {
          verified: true,
          entityVerification: EntityVerificationStatus.APPROVED,
          entityPublishedAt: new Date(),
          entityBadgeColor: "green",
        }
      : {
          verified: false,
          entityVerification: EntityVerificationStatus.REJECTED,
          entityPublishedAt: null,
          entityBadgeColor: null,
        },
  })

  const user = await findMobileUserById(entity.id)
  if (user) {
    emitChatRealtimeToUser(entity.id, {
      channel: "profile",
      type: "profile_updated",
      data: serializeMobileUser(user),
    })
  }
  await createUserNotification({
    userId: entity.id,
    type: "alert",
    title: approved ? "Entity verified" : "Entity verification update",
    message: approved
      ? "Your entity documents were approved. Your verified badge is now active."
      : "Your entity documents were not approved. Please review and resubmit them.",
  })

  revalidatePath("/entities")
  revalidatePath("/users")
  revalidatePath("/dashboard")
}
