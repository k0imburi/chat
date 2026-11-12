import assert from "node:assert/strict";
import test from "node:test";
import { EncryptJWT } from "jose";
import { createHash } from "node:crypto";
import { openChatMedia, sealChatMedia } from "../lib/chat-media-token";

const secret = "test-secret-not-used-in-production";
test("media capability hides account and key while preserving access", async () => {
  const objectKey = "private/real-user-id/chats/photo.jpg";
  const token = await sealChatMedia(objectKey, secret);
  assert.equal(await openChatMedia(token, secret), objectKey);
  assert.ok(!token.includes("real-user-id"));
  assert.ok(!Buffer.from(token.split(".")[3], "base64url").toString().includes(objectKey));
  await assert.rejects(openChatMedia(token, "wrong-secret"));
  await assert.rejects(openChatMedia(`${token.slice(0, -5)}xxxxx`, secret));
});
test("expired and non-private media capabilities are rejected", async () => {
  const key = createHash("sha256").update(`chat-media-v1:${secret}`).digest();
  const expired = await new EncryptJWT({ objectKey: "private/user/photo.jpg" })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setAudience("chat-media")
    .setExpirationTime(1).encrypt(key);
  await assert.rejects(openChatMedia(expired, secret));
  await assert.rejects(openChatMedia(await sealChatMedia("uploads/user/photo.jpg", secret), secret));
});
