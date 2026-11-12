import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session";
import { ChatPrivacyError, deleteSecureFolderMessage, listSecureFolderMessages, moveMessagesToSecureFolder, removeSecureFolderMessage } from "@/lib/mobile-chat-privacy";
import { logError } from "@/lib/log-error";

const moveSchema = z.object({
  otherUserId: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1).max(100),
  code: z.string(),
  confirmCode: z.string(),
});

async function GETHandler(request: Request) {
  const session = await getCustomerOrMobileSession(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("code") || "";
  try {
    const messages = await listSecureFolderMessages(session.userId, code);
    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open Vault";
    const status = message.includes("4-digit") ? 400 : 500;
    if (status === 500) logError("GET /api/mobile/secure-folder", error);
    return NextResponse.json({ success: false, message: status === 400 ? message : "Unable to open Vault" }, { status });
  }
}

async function POSTHandler(request: Request) {
  const session = await getCustomerOrMobileSession(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const body = moveSchema.parse(await request.json());
    const data = await moveMessagesToSecureFolder({ ...body, userId: session.userId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    if (error instanceof ChatPrivacyError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    logError("POST /api/mobile/secure-folder", error);
    return NextResponse.json({ success: false, message: "Unable to move messages to Vault" }, { status: 500 });
  }
}

async function DELETEHandler(request: Request) {
  const session = await getCustomerOrMobileSession(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const messageId = new URL(request.url).searchParams.get("messageId") || "";
  const action = new URL(request.url).searchParams.get("action") || "restore";
  if (!messageId) return NextResponse.json({ success: false, message: "Message is required" }, { status: 400 });
  try {
    const data = action === "delete"
      ? await deleteSecureFolderMessage(session.userId, messageId)
      : await removeSecureFolderMessage(session.userId, messageId);
    if (!data.removed) return NextResponse.json({ success: false, message: "Vault message not found" }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError("DELETE /api/mobile/secure-folder", error);
    return NextResponse.json({ success: false, message: action === "delete" ? "Unable to delete Vault message" : "Unable to move message out of Vault" }, { status: 500 });
  }
}


export const GET = withChatIdentity(GETHandler, getCustomerOrMobileSession);
export const POST = withChatIdentity(POSTHandler, getCustomerOrMobileSession);
export const DELETE = withChatIdentity(DELETEHandler, getCustomerOrMobileSession);
