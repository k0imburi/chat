import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

function key(secret: string) {
  return createHash("sha256").update(`chat-media-v1:${secret}`).digest();
}

export async function sealChatMedia(objectKey: string, secret: string, expiresIn = 3600) {
  return new EncryptJWT({ objectKey })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setAudience("chat-media")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .encrypt(key(secret));
}

export async function openChatMedia(token: string, secret: string) {
  const { payload } = await jwtDecrypt(token, key(secret), { audience: "chat-media" });
  if (typeof payload.objectKey !== "string" || !payload.objectKey.startsWith("private/")) {
    throw new Error("Invalid media");
  }
  return payload.objectKey;
}
