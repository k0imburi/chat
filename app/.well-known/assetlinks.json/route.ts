import {prisma} from '@/lib/prisma'
export const dynamic = 'force-dynamic'
export async function GET() {
 const config=await prisma.vaultStoreConfig.findUnique({where:{id:1}}).catch(()=>null)
 const fingerprints=(config?.androidAppLinkSha256||process.env.ANDROID_APP_LINK_SHA256||'').split(/[\n,]+/).map(value=>value.trim().toUpperCase()).filter(value=>/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))
 const statements=fingerprints.length?[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'com.chatandtip.app',sha256_cert_fingerprints:fingerprints}}]:[]
 return Response.json(statements,{headers:{'Cache-Control':'public, max-age=3600'}})
}
