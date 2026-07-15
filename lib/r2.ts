import "server-only"

import { randomUUID } from "node:crypto"
import path from "node:path"
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import mime from "mime-types"
import { prisma } from "@/lib/prisma"

export type PresignedUpload = {
  uploadUrl: string   // PUT this URL directly from the mobile client
  objectKey: string
  publicUrl: string | null
  contentType: string
  expiresIn: number   // seconds
}

type R2Settings = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  privateBucketName: string
  publicBaseUrl: string
  region: string
  endpoint: string
}

let cachedClient: S3Client | null = null
let cachedSettings: R2Settings | null = null
let lastInit = 0
const CACHE_TTL = 5 * 60 * 1000

async function loadR2Settings(): Promise<R2Settings> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  // Dashboard-configured values win when set, otherwise fall back to the
  // deploy-time env vars. Use `||` (not `??`) throughout: several of these
  // columns default to "" rather than null in the DB, and "" must still
  // fall through to the env var — `??` only treats null/undefined as unset.
  const accountId = settings?.r2AccountId || process.env.R2_ACCOUNT_ID || ""
  const accessKeyId = settings?.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID || ""
  const secretAccessKey = settings?.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || ""
  const bucketName = settings?.r2BucketName || process.env.R2_BUCKET_NAME || ""
  const privateBucketName = settings?.r2PrivateBucketName || process.env.R2_PRIVATE_BUCKET_NAME || bucketName
  const publicBaseUrl = settings?.r2PublicBaseUrl || process.env.R2_PUBLIC_BASE_URL || ""
  const region = settings?.r2Region || process.env.R2_REGION || "auto"
  const endpoint =
    settings?.r2Endpoint || process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    privateBucketName,
    publicBaseUrl,
    region,
    endpoint,
  }
}

export async function getR2Client() {
  const now = Date.now()
  if (cachedClient && cachedSettings && now - lastInit < CACHE_TTL) {
    return { client: cachedClient, settings: cachedSettings }
  }

  const settings = await loadR2Settings()

  if (!settings.accountId || !settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName) {
    throw new Error("Cloudflare R2 is not configured. Set R2 credentials in Admin → Settings.")
  }

  cachedSettings = settings
  cachedClient = new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  })
  lastInit = now

  return { client: cachedClient, settings }
}

export function getPublicUrl(objectKey: string, baseUrl?: string) {
  const resolvedBaseUrl = (baseUrl ?? cachedSettings?.publicBaseUrl ?? "").replace(/\/+$/, "")
  return resolvedBaseUrl ? `${resolvedBaseUrl}/${objectKey}` : null
}

export function generateR2Key(filename: string, prefix = "uploads") {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, "_")
  return `${prefix.replace(/\/+$/, "")}/${base}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`
}

export async function uploadBufferToR2(
  buffer: Buffer,
  fileName: string,
  options?: { contentType?: string; prefix?: string; metadata?: Record<string, string> }
) {
  const { client, settings } = await getR2Client()
  const objectKey = generateR2Key(fileName, options?.prefix)
  const contentType = options?.contentType || mime.lookup(fileName) || "application/octet-stream"

  await client.send(
    new PutObjectCommand({
      Bucket: settings.bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      Metadata: options?.metadata,
    })
  )

  const url = getPublicUrl(objectKey, settings.publicBaseUrl)

  const asset = await prisma.asset.create({
    data: {
      name: fileName,
      objectKey,
      url,
      contentType,
      sizeBytes: buffer.length,
      bucket: settings.bucketName,
      metadata: options?.metadata,
    },
  })

  return {
    asset,
    url,
    objectKey,
  }
}

export async function deleteFromR2(objectKey: string) {
  const { client, settings } = await getR2Client()

  await client.send(
    new DeleteObjectCommand({
      Bucket: settings.bucketName,
      Key: objectKey,
    })
  )

  await prisma.asset.deleteMany({ where: { objectKey } })
}

export async function getSignedR2DownloadUrl(objectKey: string, expiresIn = 3600) {
  const { client, settings } = await getR2Client()
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: settings.bucketName,
      Key: objectKey,
    }),
    { expiresIn }
  )
}

export async function getSignedPrivateR2DownloadUrl(objectKey: string, expiresIn = 300) {
  const { client, settings } = await getR2Client()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: settings.privateBucketName, Key: objectKey }),
    { expiresIn },
  )
}

/**
 * Generate a presigned PUT URL so the mobile client can upload a file
 * directly to R2 — bypassing the server entirely for the binary transfer.
 *
 * The client MUST send `Content-Type: {contentType}` when doing the PUT,
 * because the signature covers that header.
 *
 * @param fileName     original file name (used for key generation + MIME lookup)
 * @param prefix       R2 key prefix, e.g. "uploads/userId/videos"
 * @param expiresIn    URL validity in seconds (default 15 min)
 */
export async function getPresignedUploadUrl(
  fileName: string,
  prefix = "uploads",
  expiresIn = 900,
  visibility: "public" | "private" = "public",
): Promise<PresignedUpload> {
  const { client, settings } = await getR2Client()

  // Always derive content-type from the file extension so the mobile
  // client doesn't need to figure it out (and can't send octet-stream).
  const fromExt = mime.lookup(fileName)
  const contentType =
    fromExt && fromExt !== "application/octet-stream" ? fromExt : "application/octet-stream"

  const objectKey = generateR2Key(fileName, prefix)
  const bucket = visibility === "private" ? settings.privateBucketName : settings.bucketName

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn },
  )

  return {
    uploadUrl,
    objectKey,
    publicUrl: visibility === "private" ? null : getPublicUrl(objectKey, settings.publicBaseUrl),
    contentType,
    expiresIn,
  }
}
