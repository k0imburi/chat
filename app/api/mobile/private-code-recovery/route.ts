import { timingSafeEqual } from "node:crypto";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { decryptVaultSecret } from "@/lib/vault-secrets";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) return Response.json({ success: false }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  const userId = session.userId;
  const recovery = await prisma.privateCodeRecovery.findUnique({ where: { userId } });
  if (!recovery) return Response.json({ success: false }, { status: 404, headers });

  if (body?.action === "broadcast" || body?.action === "status") {
    return Response.json({ success: false }, { status: 404, headers });
  }
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^(RCT-[a-f0-9]{48}|[A-Za-z0-9]{7})$/.test(code)) return Response.json({ success: false }, { status: 400, headers });
  const expected = await decryptVaultSecret(recovery.encryptedToken);
  const normalizedCode = code.toUpperCase();
  const normalizedExpected = expected.toUpperCase();
  if (Buffer.byteLength(normalizedCode) !== Buffer.byteLength(normalizedExpected) ||
      !timingSafeEqual(Buffer.from(normalizedCode), Buffer.from(normalizedExpected))) {
    return Response.json({ success: false }, { status: 404, headers });
  }
  const groups = await prisma.chatPrivateCodeGroup.findMany({
    where: {
      userId,
      encryptedRecoveryPin: { not: null },
      OR: [{ hiddenChats: { some: {} } }, { messages: { some: {} } }, { folders: { some: {} } }],
    },
    select: { purpose: true, encryptedRecoveryPin: true },
  });
  const data = await Promise.all(groups.map(async (group) => ({
    purpose: group.purpose,
    code: await decryptVaultSecret(group.encryptedRecoveryPin!),
  })));
  return Response.json({ success: true, data }, { headers });
}
