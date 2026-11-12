import { NextResponse } from "next/server";
import { expireAllPendingHideRequests } from "@/lib/mobile-chat-privacy";
import { withDbRetry } from "@/lib/prisma";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  const data = await withDbRetry(() => expireAllPendingHideRequests());
  return NextResponse.json({ success: true, data });
}
