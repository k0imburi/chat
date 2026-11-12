import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { logError } from "@/lib/log-error";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  // Anonymous conversation aliases must never expose account metadata.
  if (id.startsWith("anon_")) return NextResponse.json({ success: false, message: "Account unavailable" }, { status: 404 });
  try {
    const user = await prisma.user.findFirst({
      where: { id, isActive: true, status: { notIn: ["BLOCKED", "HIDDEN"] } },
      select: { createdAt: true, verified: true, nameChangeCount: true, lastNameChangedAt: true, nameHistoryStartedAt: true },
    });
    if (!user) return NextResponse.json({ success: false, message: "Account unavailable" }, { status: 404 });
    return NextResponse.json({ success: true, data: {
      dateJoined: user.createdAt.toISOString(),
      verified: user.verified,
      nameChangeCount: user.nameChangeCount,
      lastNameChangedAt: user.lastNameChangedAt?.toISOString() ?? null,
      nameHistoryStartedAt: user.nameHistoryStartedAt.toISOString(),
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("GET /api/mobile/users/[id]/about", error);
    return NextResponse.json({ success: false, message: "Could not load account details" }, { status: 500 });
  }
}
