import { NextResponse } from "next/server";
import { scheduledDeletionAt } from "@/lib/account-deactivation-policy";
import { deactivateAccount } from "@/lib/account-deactivation";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  return NextResponse.json({
    success: true,
    data: {
      scheduledDeletionAt: scheduledDeletionAt(new Date()).toISOString(),
    },
  });
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId)
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  const result = await deactivateAccount(session.userId);
  return NextResponse.json({
    success: true,
    data: {
      deactivatedAt: result.deactivatedAt?.toISOString(),
      scheduledDeletionAt: result.scheduledDeletionAt?.toISOString(),
    },
  });
}
