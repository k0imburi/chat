/** Read-only preflight for migrating direct vault uploads to quota accounting. */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
async function main() {
  let cursor: string | undefined
  let rows = 0, uploads = 0, missingAssets = 0, missingSizes = 0, bytes = 0
  const seen = new Set<string>()
  for (;;) {
    const batch = await prisma.secureFolderMessage.findMany({
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      where: { message: { thread: { kind: 'SELF' } } },
      select: { id: true, ownerId: true, message: { select: { senderId: true, text: true, imageObjectKey: true, videoObjectKey: true, documentObjectKey: true } } },
    })
    if (!batch.length) break
    rows += batch.length
    const candidates = batch.flatMap(({ownerId,message}) => {
      if (message.senderId !== ownerId || !(message.text === '__CHATANDTIP_VAULT_DIRECT_UPLOAD__' || !message.text)) return []
      return [message.imageObjectKey, message.videoObjectKey, message.documentObjectKey].filter((key): key is string => !!key)
    }).filter(key => { if (seen.has(key)) return false; seen.add(key); return true })
    const assets = await prisma.asset.findMany({where:{objectKey:{in:candidates}},select:{objectKey:true,sizeBytes:true}})
    const indexed = new Map(assets.map(asset => [asset.objectKey,asset]))
    for (const key of candidates) {
      uploads++
      const asset = indexed.get(key)
      if (!asset) missingAssets++
      else if (asset.sizeBytes === null || asset.sizeBytes <= 0) missingSizes++
      else bytes += asset.sizeBytes
    }
    cursor = batch[batch.length - 1].id
  }
  console.log(JSON.stringify({scannedSelfVaultRows:rows,uniqueCandidateUploads:uploads,missingAssetRecords:missingAssets,missingSizes,knownBytes:bytes},null,2))
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
