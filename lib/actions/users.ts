"use server"

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
import { deleteFromR2 } from "@/lib/r2"
import { getUsers } from "@/lib/queries"
import { findMobileUserById, serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"

export async function queryUsersAction(params: {
  query?: string
  filterBy?: string
  status?: string
  page?: number
}) {
  await requireSessionUser()
  return getUsers(params)
}

export async function setUserVerifiedAction(userId: string, verified: boolean) {
  await requireSessionUser()
  await prisma.user.update({
    where: { id: userId },
    data: { verified },
  })
  const user = await findMobileUserById(userId)
  if (user) {
    emitChatRealtimeToUser(userId, {
      channel: "profile",
      type: "profile_updated",
      data: serializeMobileUser(user),
    })
  }
}

export async function updateUserStatusByIdAction(userId: string, status: "ACTIVE" | "BLOCKED") {
  await requireSessionUser()
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  })
  const user = await findMobileUserById(userId)
  if (user) {
    emitChatRealtimeToUser(userId, {
      channel: "profile",
      type: "profile_updated",
      data: serializeMobileUser(user),
    })
  }
  revalidatePath("/dashboard")
}

export async function deleteUserByIdAction(userId: string) {
  await requireSessionUser()
  await prisma.userMedia.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
  revalidatePath("/dashboard")
}

const userStatusSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["ACTIVE", "BLOCKED", "REPORTED", "HIDDEN"]),
})

const verifySchema = z.object({
  userId: z.string().min(1),
  verified: z.coerce.boolean(),
})

const deleteMediaSchema = z.object({
  mediaId: z.string().min(1),
  userId: z.string().min(1),
})

export async function updateUserStatusAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    await requireSessionUser()

    const parsed = userStatusSchema.parse({
      userId: formData.get("userId"),
      status: formData.get("status"),
    })

    await prisma.user.update({
      where: { id: parsed.userId },
      data: { status: parsed.status },
    })
    const user = await findMobileUserById(parsed.userId)
    if (user) {
      emitChatRealtimeToUser(parsed.userId, {
        channel: "profile",
        type: "profile_updated",
        data: serializeMobileUser(user),
      })
    }

    revalidatePath("/users")
    revalidatePath(`/users/${parsed.userId}`)
    revalidatePath("/dashboard")
    return successResult("User status updated successfully.")
  } catch (error) {
    return errorResult(error, "Unable to update user status.")
  }
}

export async function toggleUserVerificationAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    await requireSessionUser()

    const parsed = verifySchema.parse({
      userId: formData.get("userId"),
      verified: formData.get("verified"),
    })

    await prisma.user.update({
      where: { id: parsed.userId },
      data: { verified: parsed.verified },
    })
    const user = await findMobileUserById(parsed.userId)
    if (user) {
      emitChatRealtimeToUser(parsed.userId, {
        channel: "profile",
        type: "profile_updated",
        data: serializeMobileUser(user),
      })
    }

    revalidatePath("/users")
    revalidatePath(`/users/${parsed.userId}`)
    return successResult(parsed.verified ? "User verified successfully." : "User verification removed successfully.")
  } catch (error) {
    return errorResult(error, "Unable to update verification status.")
  }
}

export async function deleteUserMediaAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    await requireSessionUser()

    const parsed = deleteMediaSchema.parse({
      mediaId: formData.get("mediaId"),
      userId: formData.get("userId"),
    })

    const media = await prisma.userMedia.findUnique({ where: { id: parsed.mediaId } })
    if (!media) {
      return errorResult(new Error("Media not found."), "Media not found.")
    }

    if (media.objectKey) {
      try {
        await deleteFromR2(media.objectKey)
      } catch {
        // Keep DB cleanup working even when storage is already missing.
      }
    }

    await prisma.userMedia.delete({ where: { id: parsed.mediaId } })

    revalidatePath(`/users/${parsed.userId}`)
    revalidatePath("/users")
    revalidatePath("/dashboard")
    return successResult("Media deleted successfully.")
  } catch (error) {
    return errorResult(error, "Unable to delete media.")
  }
}
