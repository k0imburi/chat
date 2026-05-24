/**
 * R2 upload test — reads credentials from the DB (same path as the app).
 * Run: node scripts/test-r2.mjs
 */
import { PrismaClient } from "@prisma/client"
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

const prisma = new PrismaClient()

async function main() {
  console.log("1. Reading R2 settings from DB…")
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  const cfg = {
    accountId:       settings?.r2AccountId       ?? "",
    accessKeyId:     settings?.r2AccessKeyId     ?? "",
    secretAccessKey: settings?.r2SecretAccessKey ?? "",
    bucketName:      settings?.r2BucketName      ?? "",
    publicBaseUrl:   settings?.r2PublicBaseUrl   ?? "",
    region:          settings?.r2Region          ?? "auto",
    endpoint:        settings?.r2Endpoint        ?? (settings?.r2AccountId ? `https://${settings.r2AccountId}.r2.cloudflarestorage.com` : ""),
  }

  console.log("   accountId     :", cfg.accountId)
  console.log("   accessKeyId   :", cfg.accessKeyId)
  console.log("   secretKey     :", cfg.secretAccessKey ? `${cfg.secretAccessKey.slice(0, 4)}…(hidden)` : "(empty)")
  console.log("   bucket        :", cfg.bucketName)
  console.log("   publicBaseUrl :", cfg.publicBaseUrl)
  console.log("   endpoint      :", cfg.endpoint)

  const missing = ["accountId","accessKeyId","secretAccessKey","bucketName"]
    .filter(k => !cfg[k])
  if (missing.length) {
    console.error("\n❌ Missing required fields:", missing.join(", "))
    process.exit(1)
  }

  console.log("\n2. Creating S3Client…")
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  })

  const testKey = `test/r2-probe-${Date.now()}.txt`
  const testBody = Buffer.from(`R2 upload test at ${new Date().toISOString()}`)

  console.log(`\n3. Uploading test object → ${testKey}`)
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucketName,
    Key: testKey,
    Body: testBody,
    ContentType: "text/plain",
    ContentLength: testBody.length,
  }))
  console.log("   ✅ Upload successful")

  const publicUrl = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl.replace(/\/+$/, "")}/${testKey}`
    : "(no public base URL configured)"
  console.log("   Public URL:", publicUrl)

  console.log("\n4. Deleting test object…")
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: testKey }))
  console.log("   ✅ Cleanup successful")

  console.log("\n✅ R2 is working correctly — credentials from DB are valid.\n")
}

main()
  .catch(err => {
    console.error("\n❌ R2 test failed:", err.message ?? err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
