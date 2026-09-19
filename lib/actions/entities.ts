"use server";

import {
  AccountType,
  EntityVerificationStatus,
  UserRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  errorResult,
  getActionFormData,
  successResult,
  type ActionResult,
} from "@/lib/actions/action-result";
import { requireSessionUser } from "@/lib/auth";
import { findMobileUserById, serializeMobileUser } from "@/lib/mobile-users";
import { createUserNotification } from "@/lib/mobile-notifications";
import { prisma } from "@/lib/prisma";
import { emitChatRealtimeToUser } from "@/lib/realtime";

const reviewSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  badgeColor: z.enum(["blue", "gold"]).optional(),
});

export async function reviewEntityDocumentsAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData);
    const session = await requireSessionUser();
    if (
      session.role !== UserRole.SUPER_ADMIN &&
      session.role !== UserRole.ADMIN
    ) {
      throw new Error("Administrator access required");
    }

    const input = reviewSchema.parse({
      userId: formData.get("userId"),
      decision: formData.get("decision"),
      badgeColor: formData.get("badgeColor") || undefined,
    });
    const approved = input.decision === "APPROVE";
    if (approved && !input.badgeColor) {
      throw new Error("Choose a verification badge color");
    }

    const entity = await prisma.user.findFirst({
      where: { id: input.userId, accountType: AccountType.ENTITY },
      select: { id: true, entityDocuments: true },
    });
    if (!entity) throw new Error("Entity account not found");
    if (!entity.entityDocuments)
      throw new Error("No entity documents were submitted");

    await prisma.user.update({
      where: { id: entity.id },
      data: approved
        ? {
            verified: true,
            entityVerification: EntityVerificationStatus.APPROVED,
            entityPublishedAt: new Date(),
            entityBadgeColor: input.badgeColor,
          }
        : {
            verified: false,
            entityVerification: EntityVerificationStatus.REJECTED,
            entityPublishedAt: null,
            entityBadgeColor: null,
          },
    });

    const user = await findMobileUserById(entity.id);
    if (user) {
      emitChatRealtimeToUser(entity.id, {
        channel: "profile",
        type: "profile_updated",
        data: serializeMobileUser(user),
      });
    }
    await createUserNotification({
      userId: entity.id,
      type: "alert",
      title: approved ? "Entity verified" : "Entity verification update",
      message: approved
        ? "Your entity documents were approved. Your verified badge is now active."
        : "Your entity documents were not approved. Please review and resubmit them.",
    });

    revalidatePath("/entities");
    revalidatePath(`/entities/${entity.id}`);
    revalidatePath("/users");
    revalidatePath("/dashboard");
    return successResult(
      approved ? "Entity documents approved" : "Entity documents rejected",
    );
  } catch (error) {
    return errorResult(error, "Unable to review entity documents");
  }
}

const badgeSchema = z.object({
  userId: z.string().min(1),
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  badgeColor: z.enum(["blue", "gold"]),
});

export async function updateEntityBadgeAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData);
    const session = await requireSessionUser();
    if (
      session.role !== UserRole.SUPER_ADMIN &&
      session.role !== UserRole.ADMIN
    ) {
      throw new Error("Administrator access required");
    }

    const input = badgeSchema.parse({
      userId: formData.get("userId"),
      enabled: formData.get("enabled"),
      badgeColor: formData.get("badgeColor"),
    });
    const entity = await prisma.user.findFirst({
      where: { id: input.userId, accountType: AccountType.ENTITY },
      select: { id: true, entityVerification: true, entityPublishedAt: true },
    });
    if (!entity) throw new Error("Entity account not found");
    if (
      entity.entityVerification !== EntityVerificationStatus.APPROVED ||
      !entity.entityPublishedAt
    ) {
      throw new Error("Approve the entity documents before managing its badge");
    }

    await prisma.user.update({
      where: { id: entity.id },
      data: {
        verified: input.enabled,
        entityBadgeColor: input.badgeColor,
      },
    });
    const user = await findMobileUserById(entity.id);
    if (user) {
      emitChatRealtimeToUser(entity.id, {
        channel: "profile",
        type: "profile_updated",
        data: serializeMobileUser(user),
      });
    }

    revalidatePath("/entities");
    revalidatePath(`/entities/${entity.id}`);
    revalidatePath("/users");
    return successResult(
      input.enabled ? "Entity badge updated" : "Entity badge hidden",
    );
  } catch (error) {
    return errorResult(error, "Unable to update entity badge");
  }
}
