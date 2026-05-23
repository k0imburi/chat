import "server-only"

import { randomUUID } from "node:crypto"
import path from "node:path"
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import mime from "mime-types"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"

type R2Settings = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
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

  const accountId = settings?.r2AccountId || env.R2_ACCOUNT_ID || ""
  const accessKeyId = settings?.r2AccessKeyId || env.R2_ACCESS_KEY_ID || ""
  const secretAccessKey = settings?.r2SecretAccessKey || env.R2_SECRET_ACCESS_KEY || ""
  const bucketName = settings?.r2BucketName || env.R2_BUCKET_NAME || ""
  const publicBaseUrl = settings?.r2PublicBaseUrl || env.R2_PUBLIC_BASE_URL || ""
  const region = settings?.r2Region || env.R2_REGION || "auto"
  const endpoint =
    settings?.r2Endpoint ||
    env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
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
    throw new Error("Cloudflare R2 is not configured. Update environment variables or admin settings.")
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
