import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { AdEditor } from "@/components/customer/ad-editor"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { prisma } from "@/lib/prisma"

export default async function CreateAdPage({searchParams}:{searchParams:Promise<{sourceMediaId?:string}>}) {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/ads" signedIn={false}><SignInRequired title="Sign in to create an ad" /></CustomerShell>
  const {sourceMediaId}=await searchParams
  const sourcePost=sourceMediaId?await prisma.userMedia.findFirst({where:{id:sourceMediaId,userId:user.userId,adCampaignId:null,isHiddenByOwner:false},select:{id:true,url:true,thumbnailUrl:true,caption:true,description:true,kind:true}}):null
  const interests = Array.isArray(user.interests) ? user.interests.filter((item): item is string => typeof item === "string") : []
  return <CustomerShell active="/ads" signedIn><AdEditor language={user.language || "en"} country={user.location?.country || "KE"} interests={interests} sourcePost={sourcePost?{...sourcePost,kind:String(sourcePost.kind)}:null} /></CustomerShell>
}
