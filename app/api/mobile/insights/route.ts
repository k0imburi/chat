import { NextResponse } from "next/server";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { accountInsights } from "@/lib/mobile-insights";
import { logError } from "@/lib/log-error";

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  if (![7, 30, 90].includes(days)) return NextResponse.json({ success: false, message: "Invalid period" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, data: await accountInsights(session.userId, days) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    logError("GET /api/mobile/insights", error);
    return NextResponse.json({ success: false, message: "Could not load insights" }, { status: 503 });
  }
}
