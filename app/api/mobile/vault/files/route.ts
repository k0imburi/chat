import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCustomerOrMobileSession } from '@/lib/customer-mobile-session';
import { ChatPrivacyError, saveVaultUpload } from '@/lib/mobile-chat-privacy';
const schema=z.object({code:z.string().regex(/^\d{4}$/),objectKey:z.string().min(1).max(1024),name:z.string().min(1).max(255),folderId:z.string().min(1).optional(),thumbnailKey:z.string().max(1024).optional()}).strict();
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request) {
 const session=await getCustomerOrMobileSession(request);
 if(!session?.userId)return NextResponse.json({success:false,message:'Unauthorized'},{status:401,headers});
 try {
  const input=schema.parse(await request.json());
  return NextResponse.json({success:true,data:await saveVaultUpload(session.userId,input)},{headers});
 } catch(error) {
  return NextResponse.json({success:false,message:error instanceof ChatPrivacyError?error.message:'Could not save the file to Vault. Please try again.'},{status:error instanceof z.ZodError?400:error instanceof ChatPrivacyError?error.status:500,headers});
 }
}
