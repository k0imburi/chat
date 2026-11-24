/** Backfills known direct vault uploads without changing or deleting media.
 * Dry run by default. Run with --apply after the additive schema migration. */
import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'
const prisma = new PrismaClient()
async function main() {
  const apply = process.argv.includes('--apply')
  let cursor: string | undefined
  const owners = new Map<string,string>()
  for (;;) {
    const batch = await prisma.secureFolderMessage.findMany({take:500,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy:{id:'asc'},where:{message:{thread:{kind:'SELF'}}},select:{id:true,ownerId:true,message:{select:{senderId:true,text:true,imageObjectKey:true,videoObjectKey:true,documentObjectKey:true}}}})
    if (!batch.length) break
    for (const {ownerId,message} of batch) {
      if (message.senderId!==ownerId || !(message.text==='__CHATANDTIP_VAULT_DIRECT_UPLOAD__' || !message.text)) continue
      for (const key of [message.imageObjectKey,message.videoObjectKey,message.documentObjectKey]) {
        if (!key) continue
        if (owners.has(key) && owners.get(key)!==ownerId) throw new Error('Ambiguous vault object ownership; no backfill performed')
        owners.set(key,ownerId)
      }
    }
    cursor=batch[batch.length-1].id
  }
  const entries=[...owners]
  const assets=[]
  for (let i=0;i<entries.length;i+=500) assets.push(...await prisma.asset.findMany({where:{objectKey:{in:entries.slice(i,i+500).map(([key])=>key)}},select:{objectKey:true,sizeBytes:true}}))
  const byKey=new Map(assets.map(asset=>[asset.objectKey,asset]))
  const missing=entries.filter(([key])=>!byKey.get(key)?.sizeBytes)
  if (missing.length) throw new Error(`${missing.length} vault uploads lack size records; no backfill performed`)
  if (apply) {
    for (const [objectKey,userId] of entries) {
      const objectKeyHash=createHash('sha256').update(objectKey).digest('hex')
      const existing=await prisma.vaultUploadLedger.findUnique({where:{objectKeyHash}})
      if (existing && (existing.userId!==userId || existing.objectKey!==objectKey)) throw new Error('Existing ledger ownership mismatch')
      if (!existing) await prisma.vaultUploadLedger.create({data:{userId,objectKey,objectKeyHash,sizeBytes:BigInt(byKey.get(objectKey)!.sizeBytes!),state:'COMMITTED'}})
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',uploads:entries.length,totalBytes:assets.reduce((sum,asset)=>sum+(asset.sizeBytes??0),0)}))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>prisma.$disconnect())
