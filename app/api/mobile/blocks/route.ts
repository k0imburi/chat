import { NextResponse } from "next/server";
import { withChatIdentity } from "@/lib/chat-identity";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { blockUser, getBlockedUsers, isBlocked, unblockUser } from "@/lib/mobile-social";

export const GET = withChatIdentity(async (request: Request) => {
  const session = await getMobileSessionFromRequest(request);
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  const query = new URL(request.url).searchParams;
  if (query.get("action") === "status") {
    const first = query.get("userId1");
    const second = query.get("userId2");
    if (!first || !second || (first !== session.userId && second !== session.userId)) {
      return NextResponse.json({ success: false }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: await isBlocked(first, second) });
  }
  return NextResponse.json({ success: true, data: await getBlockedUsers(session.userId) });
});

export const POST = withChatIdentity(async (request: Request) => {
  const session = await getMobileSessionFromRequest(request);
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  const body = await request.json();
  if (typeof body.otherUserId !== "string" || !body.otherUserId || body.otherUserId === session.userId) {
    return NextResponse.json({ success: false, message: "Invalid account" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: await blockUser(session.userId, body.otherUserId) });
});

export const DELETE = withChatIdentity(async (request: Request) => {
  const session = await getMobileSessionFromRequest(request);
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  const peer = new URL(request.url).searchParams.get("otherUserId");
  if (!peer) return NextResponse.json({ success: false }, { status: 400 });
  return NextResponse.json({ success: true, data: await unblockUser(session.userId, peer) });
});
