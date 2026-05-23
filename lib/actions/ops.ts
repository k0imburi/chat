"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { deleteFromR2, getSignedR2DownloadUrl } from "@/lib/r2"
import { errorResult, getActionFormData, successResult, type ActionResult } from "@/lib/actions/action-result"
import {
  getAssetsAdmin,
  getChatThreadsAdmin,
  getVerificationLogsAdmin,
} from "@/lib/ops-queries"

const chatQuerySchema = z.object({
  query: z.string().optional(),
})

const assetQuerySchema = z.object({
  query: z.string().optional(),
})

const verificationQuerySchema = z.object({
  query: z.string().optional(),
  purpose: z.string().optional(),
})

const assetDeleteSchema = z.object({
  assetId: z.string().min(1),
})

const verificationRevokeSchema = z.object({
  verificationId: z.string().min(1),
})

export async function queryChatThreadsAdminAction(params: { query?: string }) {
  await requireSessionUser()
  return getChatThreadsAdmin(chatQuerySchema.parse(params))
}

export async function queryAssetsAdminAction(params: { query?: string }) {
  await requireSessionUser()
  return getAssetsAdmin(assetQuerySchema.parse(params))
}

export async function queryVerificationLogsAdminAction(params: {
  query?: string
  purpose?: string
}) {
  await requireSessionUser()
  return getVerificationLogsAdmin(verificationQuerySchema.parse(params))
}

export async function deleteAssetAdminAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    await requireSessionUser()
    const parsed = assetDeleteSchema.parse({
      assetId: formData.get("assetId"),
    })

    const asset = await prisma.asset.findUnique({
      where: { id: parsed.assetId },
    })

    if (!asset) {
      throw new Error("Asset not found.")
    }

    const linkedMedia = await prisma.userMedia.findFirst({
      where: { objectKey: asset.objectKey },
      select: { id: true },
    })

    if (linkedMedia) {
      throw new Error("This asset is still linked to user media and cannot be deleted here.")
    }

    await deleteFromR2(asset.objectKey)

    revalidatePath("/assets")
    return successResult("Asset deleted successfully.")
  } catch (error) {
    return errorResult(error, "Unable to delete asset.")
  }
}

export async function revokeVerificationCodeAction(verificationId: string) {
  await requireSessionUser()
  const parsed = verificationRevokeSchema.parse({ verificationId })

  const record = await prisma.verificationCode.findUnique({
    where: { id: parsed.verificationId },
  })

  if (!record) {
    throw new Error("Verification record not found.")
  }

  if (record.consumedAt) {
    return { success: true, message: "Verification code already closed." }
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  revalidatePath("/verification-logs")
  return { success: true, message: "Verification code revoked successfully." }
}

export async function getAssetDownloadUrlAction(assetId: string) {
  await requireSessionUser()

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  })

  if (!asset) {
    throw new Error("Asset not found.")
  }

  return {
    url: await getSignedR2DownloadUrl(asset.objectKey),
  }
}
