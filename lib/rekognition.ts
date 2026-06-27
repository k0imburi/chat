import "server-only"

import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { prisma } from "@/lib/prisma"
import { getR2Client } from "@/lib/r2"

type RekognitionSettings = {
  accessKeyId: string
  secretAccessKey: string
  region: string
}

let cachedRekClient: RekognitionClient | null = null
let cachedRekSettings: RekognitionSettings | null = null
let lastRekInit = 0
const REK_CACHE_TTL = 5 * 60 * 1000

async function loadRekognitionSettings(): Promise<RekognitionSettings> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  return {
    accessKeyId: settings?.awsAccessKeyId ?? process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: settings?.awsSecretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
    region: settings?.awsRegion ?? process.env.AWS_REGION ?? "us-east-1",
  }
}

async function getRekognitionClient() {
  const now = Date.now()
  if (cachedRekClient && cachedRekSettings && now - lastRekInit < REK_CACHE_TTL) {
    return cachedRekClient
  }
  const s = await loadRekognitionSettings()
  cachedRekSettings = s
  cachedRekClient = new RekognitionClient({
    region: s.region,
    credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
  })
  lastRekInit = now
  return cachedRekClient
}

export type CompareFacesResult = {
  similarity: number
  matched: boolean
  lowQuality: boolean
}

async function ensureUnder5MB(buf: Buffer): Promise<Buffer> {
  const MAX = 5 * 1024 * 1024
  if (buf.length <= MAX) return buf
  // Dynamically import sharp only when needed
  const sharp = (await import("sharp")).default
  let quality = 85
  let out = buf
  while (out.length > MAX && quality > 20) {
    out = await sharp(buf).jpeg({ quality }).toBuffer()
    quality -= 15
  }
  return out
}

export async function fetchPrivateR2Bytes(key: string): Promise<Buffer> {
  const { client, settings } = await getR2Client()
  const resp = await client.send(new GetObjectCommand({ Bucket: settings.privateBucketName, Key: key }))
  if (!resp.Body) throw new Error("Empty response from R2")
  const chunks: Buffer[] = []
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function fetchBytesFromUrl(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`)
  const arrayBuf = await resp.arrayBuffer()
  return Buffer.from(arrayBuf)
}

export async function compareFacesBytes(selfie: Buffer, avatar: Buffer): Promise<CompareFacesResult> {
  const [selfieBytes, avatarBytes] = await Promise.all([ensureUnder5MB(selfie), ensureUnder5MB(avatar)])
  const client = await getRekognitionClient()
  try {
    const resp = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: selfieBytes },
        TargetImage: { Bytes: avatarBytes },
        SimilarityThreshold: 0,
        QualityFilter: "AUTO",
      }),
    )
    const top = resp.FaceMatches?.[0]
    if (!top) return { similarity: 0, matched: false, lowQuality: false }
    return { similarity: top.Similarity ?? 0, matched: true, lowQuality: false }
  } catch (err: unknown) {
    const name = (err as { name?: string }).name ?? ""
    if (name === "InvalidParameterException" || name === "InvalidImageFormatException") {
      return { similarity: 0, matched: false, lowQuality: true }
    }
    throw err
  }
}
