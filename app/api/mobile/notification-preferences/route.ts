import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";

const categories = ["message", "booking", "tip", "social", "post", "system"] as const;
const preferencesSchema = z.object({
  preferences: z.object({
    ...Object.fromEntries(categories.map((key) => [key, z.boolean().optional()])),
    notificationsEnabled: z.boolean().optional(),
    vibrationEnabled: z.boolean().optional(),
    soundId: z.enum(["default", "cat_pulse", "cat_ripple", "cat_glow", "cat_chime"]).optional(),
  }).strict(),
});
const defaults = Object.fromEntries(categories.map((key) => [key, true]));

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { notificationPreferences: true },
  });
  const stored = user?.notificationPreferences;
  const preferences = stored && typeof stored === "object" && !Array.isArray(stored)
    ? { ...defaults, ...(stored as Record<string, unknown>) }
    : { ...defaults, notificationsEnabled: true, vibrationEnabled: true };
  return NextResponse.json({ success: true, preferences });
}

export async function PATCH(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false }, { status: 401 });
  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid preferences" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { notificationPreferences: true },
  });
  const stored = user?.notificationPreferences;
  const current = stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : { ...defaults, notificationsEnabled: true, vibrationEnabled: true };
  const preferences = { ...current, ...parsed.data.preferences };
  await prisma.user.update({
    where: { id: session.userId },
    data: { notificationPreferences: preferences },
  });
  return NextResponse.json({ success: true, preferences });
}
