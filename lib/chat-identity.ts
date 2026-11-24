import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { maskChatPayload } from "@/lib/chat-identity-payload";
import { sealChatMedia } from "@/lib/chat-media-token";
import { env } from "@/lib/env";

export async function resolveChatPeer(viewerId: string, publicId: string) {
  if (!publicId.startsWith("anon_")) return publicId;
  const participant = await prisma.chatParticipant.findFirst({
    where: { id: publicId.slice(5), otherUserId: viewerId, thread: { kind: "DIRECT" } },
    select: { userId: true },
  });
  if (!participant) throw new Error("Conversation not found");
  return participant.userId;
}

export async function protectChatPayload<T>(viewerId: string, payload: T): Promise<T> {
  const participants = await prisma.chatParticipant.findMany({
    where: { otherUserId: viewerId, anonymous: true, thread: { kind: "DIRECT" } },
    select: { id: true, userId: true },
  });
  const identities = participants.map((row) => ({ userId: row.userId, alias: `anon_${row.id}` }));
  const senderIds = new Set(identities.map((row) => row.userId));
  const mediaFields = ["imageUrl", "videoUrl", "thumbnailUrl", "documentUrl"] as const;
  async function protectMedia(value: unknown): Promise<unknown> {
    if (Array.isArray(value)) return Promise.all(value.map(protectMedia));
    if (!value || typeof value !== "object" || value instanceof Date) return value;
    const source = value as Record<string, unknown>;
    const result = Object.fromEntries(await Promise.all(Object.entries(source).map(async ([k, v]) => [k, await protectMedia(v)])));
    if (senderIds.has(String(source.senderId)) && mediaFields.some((field) => source[field])) {
      const message = typeof source.id === "string" ? await prisma.chatMessage.findFirst({
        where: { id: source.id, senderId: { in: [...senderIds] }, thread: { participants: { some: { userId: viewerId } } } },
        select: { imageObjectKey: true, videoObjectKey: true, thumbnailObjectKey: true, documentObjectKey: true },
      }) : null;
      for (const field of mediaFields) {
        if (!source[field]) continue;
        const objectKey = message?.[field.replace("Url", "ObjectKey") as keyof NonNullable<typeof message>];
        // Legacy public URLs cannot be exposed safely in an anonymous chat.
        result[field] = objectKey?.startsWith("private/")
          ? `${(env.APP_URL || "https://melodious-spirit-production-5460.up.railway.app").replace(/\/$/, "")}/api/mobile/chat-media?token=${await sealChatMedia(objectKey, env.JWT_SECRET)}`
          : "";
      }
    }
    return result;
  }
  return maskChatPayload(await protectMedia(payload), identities) as T;
}

export async function publicChatPeerId(viewerId: string, peerId: string) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId: peerId, otherUserId: viewerId, anonymous: true, thread: { kind: "DIRECT" } },
    select: { id: true },
  });
  return participant ? `anon_${participant.id}` : peerId;
}

export function withChatIdentity<P extends Record<string, string>>(
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
  authenticate: (request: Request) => Promise<{ userId: string } | null> = getMobileSessionFromRequest,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const session = await authenticate(request);
    if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    try {
      const params = { ...await context.params };
      if (params.otherUserId) Object.assign(params, { otherUserId: await resolveChatPeer(session.userId, params.otherUserId) });
      const url = new URL(request.url);
      for (const field of ["otherUserId", "peerUserId", "userId1", "userId2"]) {
        const id = url.searchParams.get(field);
        if (id?.startsWith("anon_")) url.searchParams.set(field, await resolveChatPeer(session.userId, id));
      }
      let resolvedRequest = new Request(url, request.clone());
      if (request.method !== "GET" && request.method !== "HEAD") {
        const body = await request.clone().json().catch(() => null);
        if (body && typeof body === "object") {
          for (const field of ["otherUserId", "peerUserId", "replyToSenderId", "reportedUserId"]) {
            if (typeof body[field] === "string") body[field] = await resolveChatPeer(session.userId, body[field]);
          }
          resolvedRequest = new Request(url, { method: request.method, headers: request.headers, body: JSON.stringify(body), signal: request.signal });
        }
      }
      const response = await handler(resolvedRequest, { params: Promise.resolve(params) });
      const body = await response.json();
      return NextResponse.json(await protectChatPayload(session.userId, body), { status: response.status, headers: response.headers });
    } catch {
      // Never fall back to an unsanitized response if identity resolution fails.
      return NextResponse.json({ success: false, message: "Unable to access conversation" }, { status: 503 });
    }
  };
}
