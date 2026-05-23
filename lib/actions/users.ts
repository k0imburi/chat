"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { deleteFromR2 } from "@/lib/r2"
import { getUsers } from "@/lib/queries"

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
}

export async function updateUserStatusByIdAction(userId: string, status: "ACTIVE" | "BLOCKED") {
  await requireSessionUser()
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  })
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

export async function updateUserStatusAction(formData: FormData) {
  await requireSessionUser()

  const parsed = userStatusSchema.parse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  })

  await prisma.user.update({
    where: { id: parsed.userId },
    data: { status: parsed.status },
  })

  revalidatePath("/users")
  revalidatePath(`/users/${parsed.userId}`)
  revalidatePath("/dashboard")
}

export async function toggleUserVerificationAction(formData: FormData) {
  await requireSessionUser()

  const parsed = verifySchema.parse({
    userId: formData.get("userId"),
    verified: formData.get("verified"),
  })

  await prisma.user.update({
    where: { id: parsed.userId },
    data: { verified: parsed.verified },
  })

  revalidatePath("/users")
  revalidatePath(`/users/${parsed.userId}`)
}

export async function deleteUserMediaAction(formData: FormData) {
  await requireSessionUser()

  const parsed = deleteMediaSchema.parse({
    mediaId: formData.get("mediaId"),
    userId: formData.get("userId"),
  })

  const media = await prisma.userMedia.findUnique({ where: { id: parsed.mediaId } })
  if (!media) return

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
}
