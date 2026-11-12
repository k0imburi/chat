import assert from "node:assert/strict";
import test from "node:test";
import { maskChatPayload } from "../lib/chat-identity-payload";
const identities = [{ userId: "private-id", alias: "anon_conversation" }];
test("anonymous profiles expose no public identity fields", () => {
  const masked = maskChatPayload({ receiver: { userId: "private-id", fullname: "Real Name", email: "secret@example.com", deviceToken: "secret", profileVideo: { url: "private" } } }, identities);
  const json = JSON.stringify(masked);
  for (const secret of ["private-id", "Real Name", "secret", "private\""]) assert.ok(!json.includes(secret));
  assert.ok(json.includes("Anonymous"));
});
test("message, quote and reaction identities use the conversation alias", () => {
  assert.deepEqual(maskChatPayload({ senderId: "private-id", textMsg: "hello", replyToSenderId: "private-id", replyToSenderName: "Real Name", reactions: { like: ["private-id", "viewer"] } }, identities), {
    senderId: "anon_conversation", textMsg: "hello", replyToSenderId: "anon_conversation", replyToSenderName: "Anonymous", reactions: { like: ["anon_conversation", "viewer"] },
  });
});
test("unrelated conversations and authored text are unchanged", () => {
  const payload = { senderId: "someone-else", textMsg: "private-id" };
  assert.deepEqual(maskChatPayload(payload, identities), payload);
});
