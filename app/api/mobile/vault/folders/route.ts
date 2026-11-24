import { NextResponse } from "next/server";
import { z } from "zod";
import { withChatIdentity } from "@/lib/chat-identity";
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session";
import { ChatPrivacyError, manageVaultFolders, listSecureFolderMessages } from "@/lib/mobile-chat-privacy";

const schema = z.object({
 code: z.string().regex(/^\d{4}$/),
 action: z.enum(["list", "initialize", "create", "renameFolder", "renameItem", "moveItems"]),
 folderId: z.string().min(1).optional(), parentId: z.string().min(1).nullable().optional(),
 name: z.string().max(255).optional(), itemIds: z.array(z.string().min(1)).min(1).max(100).optional(),
}).strict();
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization, Cookie" };
async function handler(request: Request) {
 const session = await getCustomerOrMobileSession(request);
 if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, {status:401, headers});
 try {
  const input = schema.parse(await request.json());
  const data = await manageVaultFolders(session.userId, input);
  const result = input.action === "list" ? { ...data, items: await listSecureFolderMessages(session.userId, input.code) } : data;
  return NextResponse.json({success:true, data: result}, {headers});
 } catch(error) {
  const status = error instanceof z.ZodError ? 400 : error instanceof ChatPrivacyError ? error.status : 500;
  return NextResponse.json({success:false, message: error instanceof ChatPrivacyError ? error.message : status === 400 ? "Invalid request" : "Unable to update Vault. Please try again."}, {status, headers});
 }
}
export const POST = withChatIdentity(handler, getCustomerOrMobileSession);
