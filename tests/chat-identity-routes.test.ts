import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { openChatMedia } from "../lib/chat-media-token";

// Bundle the real transport wrapper with only authentication and persistence
// replaced. No production accounts or messages are touched by these tests.
async function harness(viewer: string | null = "recipient") {
  const mocks = {
    authenticate: async () => viewer ? { userId: viewer } : null,
    prisma: {
      chatParticipant: {
        findFirst: async ({ where }: any) => where.id === "conversation" && where.otherUserId === "recipient" && where.thread.kind === "DIRECT" ? { userId: "real-sender" } : null,
        findMany: async ({ where }: any) => where.otherUserId === "recipient" && where.anonymous === true ? [{ id: "conversation", userId: "real-sender" }] : [],
      },
      chatMessage: {
        findFirst: async ({ where }: any) => where.id === "attachment" && where.thread.participants.some.userId === "recipient" ? { imageObjectKey: "private/real-sender/chats/photo.jpg" } : null,
      },
    },
  };
  const compiled = await build({
    entryPoints: ["lib/chat-identity.ts"], bundle: true, write: false,
    platform: "node", format: "cjs", packages: "external",
    plugins: [{
      name: "test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^(server-only|@\/lib\/(prisma|mobile-session|env))$/ }, ({ path }) => ({ path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents:
          path === "server-only" ? "" : path.endsWith("prisma") ? "export const prisma = __mocks.prisma;" : path.endsWith("env") ? 'export const env = { JWT_SECRET: "test-secret", APP_URL: "https://chat.example" };' : "export const getMobileSessionFromRequest = __mocks.authenticate;",
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", "__mocks", compiled.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`), module, module.exports, mocks);
  return { ...module.exports, mocks };
}

test("reply aliases resolve internally and response identity is masked", async () => {
  const api = await harness();
  let calls = 0;
  const route = api.withChatIdentity(async (request: Request, context: any) => {
    calls++;
    assert.equal((await context.params).otherUserId, "real-sender");
    assert.equal(new URL(request.url).searchParams.get("peerUserId"), "real-sender");
    assert.equal((await request.json()).replyToSenderId, "real-sender");
    return Response.json({ senderId: "real-sender", receiver: { userId: "real-sender", fullname: "Private Name" } });
  });
  const response = await route(new Request("https://chat.example/reply?peerUserId=anon_conversation", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replyToSenderId: "anon_conversation" }),
  }), { params: Promise.resolve({ otherUserId: "anon_conversation" }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls, 1);
  assert.equal(body.senderId, "anon_conversation");
  assert.equal(body.receiver.fullname, "Anonymous");
  assert.ok(!JSON.stringify(body).includes("real-sender"));
});

test("foreign aliases and unauthenticated requests never invoke the endpoint", async () => {
  for (const viewer of ["unrelated", null]) {
    const api = await harness(viewer);
    let called = false;
    const route = api.withChatIdentity(async () => { called = true; return Response.json({}); });
    const response = await route(new Request("https://chat.example/chat"), { params: Promise.resolve({ otherUserId: "anon_conversation" }) });
    assert.equal(called, false);
    assert.equal(response.status, viewer ? 503 : 401);
  }
});

test("privacy lookup failure withholds the raw response", async () => {
  const api = await harness();
  api.mocks.prisma.chatParticipant.findMany = async () => { throw new Error("offline"); };
  const route = api.withChatIdentity(async () => Response.json({ senderId: "real-sender" }));
  const response = await route(new Request("https://chat.example/chat"), { params: Promise.resolve({}) });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("real-sender"));
});

test("anonymous attachments and Vault payloads contain no uploader ID or signed storage URL", async () => {
  const api = await harness();
  const payload = { message: { id: "attachment", senderId: "real-sender", imageUrl: "https://storage/private/real-sender/chats/photo.jpg" } };
  const result = await api.protectChatPayload("recipient", payload);
  assert.ok(!JSON.stringify(result).includes("real-sender"));
  assert.ok(!JSON.stringify(result).includes("https://storage"));
  const url = new URL(result.message.imageUrl);
  assert.equal(url.pathname, "/api/mobile/chat-media");
  assert.equal(await openChatMedia(url.searchParams.get("token")!, "test-secret"), "private/real-sender/chats/photo.jpg");
});
