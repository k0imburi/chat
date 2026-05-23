"use server"

import { revalidatePath } from "next/cache"
import { PlanInterval } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  code: z.string().min(2),
  description: z.string().optional(),
  amount: z.coerce.number().min(0),
  currency: z.string().min(3),
  interval: z.nativeEnum(PlanInterval),
  intervalCount: z.coerce.number().int().min(1),
  isActive: z.coerce.boolean().optional(),
  features: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export async function upsertPaymentPlanAction(formData: FormData) {
  await requireSessionUser()

  const parsed = schema.parse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    code: formData.get("code"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    interval: formData.get("interval"),
    intervalCount: formData.get("intervalCount"),
    isActive: formData.get("isActive") === "on",
    features: formData.get("features") || "",
    sortOrder: formData.get("sortOrder") || 0,
  })

  const data = {
    name: parsed.name,
    code: parsed.code,
    description: parsed.description,
    amount: parsed.amount,
    currency: parsed.currency.toUpperCase(),
    interval: parsed.interval,
    intervalCount: parsed.intervalCount,
    isActive: parsed.isActive ?? false,
    features: parsed.features
      ? parsed.features
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    sortOrder: parsed.sortOrder,
  }

  if (parsed.id) {
    await prisma.paymentPlan.update({
      where: { id: parsed.id },
      data,
    })
  } else {
    await prisma.paymentPlan.create({ data })
  }

  revalidatePath("/payment-plans")
  revalidatePath("/dashboard")
}

export async function deletePaymentPlanAction(formData: FormData) {
  await requireSessionUser()
  const id = z.string().min(1).parse(formData.get("id"))
  await prisma.paymentPlan.delete({ where: { id } })
  revalidatePath("/payment-plans")
}
