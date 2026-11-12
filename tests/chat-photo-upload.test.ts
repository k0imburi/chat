import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { build } from "esbuild"
import { sealChatMedia } from "../lib/chat-media-token"

test("chat photos and Vault videos round-trip through protected storage", async () => {
  const secret = "isolated-test-secret"
  const writes: {
    Key: string; Bucket: string; Body: Buffer; ContentType: string;
    Metadata?: Record<string, string>; SSECustomerKey?: string; Range?: string;
  }[] = []
  const assets: unknown[] = []
  const quotaChecks: unknown[] = []
  let userId: string | null = "sender"
  const settings = { bucketName: "shared", privateBucketName: "shared" }
  const mocks = {
    auth: () => userId ? { userId } : null,
    getR2Client: async () => ({
      settings,
      client: { send: async ({ input }: { input: (typeof writes)[number] }) => {
        if (input.Body) return writes.push(input)
        const object = writes.find((write) => write.Key === input.Key && write.Bucket === input.Bucket)
        if (object?.SSECustomerKey) {
          assert.equal(input.SSECustomerKey, object.SSECustomerKey)
          assert.equal(input.Range, "bytes=1-2")
          return {
            ContentType: object.ContentType,
            ContentRange: "bytes 1-2/4",
            ContentLength: 2,
            Body: { transformToWebStream: () => new Blob([photo.slice(1, 3)]).stream() },
          }
        }
        return object && {
          Metadata: object.Metadata,
          Body: { transformToByteArray: async () => object.Body },
        }
      } },
    }),
    generateR2Key: (name: string, prefix: string) => `${prefix}/${name}`,
    getPublicUrl: () => { throw new Error("Private photos must not have a public URL") },
    prisma: { asset: { create: async ({ data }: { data: unknown }) => assets.push(data) } },
    logError: () => {},
    env: { JWT_SECRET: secret },
    assertStorageAvailable: async (owner: string, bytes: number) => quotaChecks.push([owner, bytes]),
  }
  const modules: Record<string, string> = {
    "mobile-session": "export const getMobileSessionFromRequest = mocks.auth",
    "r2": "export const { getR2Client, generateR2Key, getPublicUrl } = mocks",
    "prisma": "export const { prisma } = mocks",
    "log-error": "export const { logError } = mocks",
    "storage-quota": "export const { assertStorageAvailable } = mocks",
    env: "export const { env } = mocks",
  }
  const compiled = await build({
    entryPoints: ["app/api/mobile/storage/upload/route.ts", "app/api/mobile/chat-media/route.ts"],
    outdir: "test-bundle",
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{
      name: "storage-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(mobile-session|r2|prisma|log-error|storage-quota|env)$/ }, ({ path }) => ({
          path: path.split("/").at(-1)!, namespace: "mock",
        }))
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: modules[path] }))
      },
    }],
  })
  function load(suffix: string) {
    const module = { exports: {} as Record<string, (request: Request) => Promise<Response>> }
    const bundle = compiled.outputFiles.find((file) => file.path.endsWith(suffix))!
    new Function("require", "module", "exports", "mocks", bundle.text)(
      createRequire(`${process.cwd()}/package.json`), module, module.exports, mocks,
    )
    return module.exports
  }
  const { POST } = load("/storage/upload/route.js")
  const { GET } = load("/chat-media/route.js")
  const photo = Uint8Array.of(137, 80, 78, 71)
  const upload = (name: string, dirName = "chats") => {
    const form = new FormData()
    form.set("visibility", "private")
    form.set("dir_name", dirName)
    form.set("file", new Blob([photo]), name)
    return POST(new Request("https://chat.example/api/mobile/storage/upload", {
      method: "POST", body: form,
    }))
  }

  assert.equal((await upload("test.svg")).status, 400)
  assert.equal((await upload("test.png", "../public")).status, 400)
  userId = null
  assert.equal((await upload("test.png")).status, 401)
  assert.equal(writes.length, 0)
  userId = "sender"
  const response = await upload("test.png")
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    success: true, object_key: "private/web-chat-photos-v1/photo", file_url: null,
  })
  assert.equal(writes.length, 1)
  assert.deepEqual(quotaChecks.at(-1), ["sender", 4])
  assert.equal(writes[0].Bucket, "shared")
  assert.notDeepEqual(new Uint8Array(writes[0].Body), photo)
  assert.equal((assets[0] as { visibility: string }).visibility, "private")
  const url = "https://chat.example/api/mobile/chat-media"
  assert.equal((await GET(new Request(url))).status, 404)
  const token = await sealChatMedia(writes[0].Key, secret)
  const request = () => new Request(`${url}?token=${token}`)
  const download = await GET(request())
  assert.equal(download.status, 200)
  assert.equal(download.headers.get("content-type"), "image/png")
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), photo)
  writes[0].Body[28] ^= 1
  assert.equal((await GET(request())).status, 404)
  const vaultUpload = await upload("test.mp4", "vault")
  assert.equal(vaultUpload.status, 200)
  assert.deepEqual(await vaultUpload.json(), {
    success: true, object_key: "private/web-vault-media-v1/media", file_url: null,
    content_type: "video/mp4",
  })
  assert.ok(writes[1].SSECustomerKey)
  const videoToken = await sealChatMedia(writes[1].Key, secret)
  const rangeResponse = await GET(new Request(`${url}?token=${videoToken}`, {
    headers: { Range: "bytes=1-2" },
  }))
  assert.equal(rangeResponse.status, 206)
  assert.equal(rangeResponse.headers.get("content-range"), "bytes 1-2/4")
  assert.deepEqual(new Uint8Array(await rangeResponse.arrayBuffer()), photo.slice(1, 3))
})
