import 'server-only';
import {prisma} from '@/lib/prisma';
import {resolveStripeConfig} from '@/lib/stripe';
import {resolvePaystackConfig,initializePaystackTransaction} from '@/lib/paystack';
export async function adCheckout(userId:string,campaignId:string,requestKey:string,origin:string) {
  const config=await resolveStripeConfig();
  const paystack=await resolvePaystackConfig();
  if(!paystack.enabled&&(!config.enabled||!config.webhookSecret)) throw new Error('Enable a payment gateway in dashboard settings to accept ad payments.');
  const ad=await prisma.adCampaign.findFirstOrThrow({where:{id:campaignId,ownerId:userId}});
  if(ad.isTest) throw new Error('Test campaigns cannot accept real payments.');
  if(ad.budgetMicros<=0n||!ad.creative) throw new Error('Recreate this older draft before checkout.');
  if(ad.publishedAt&&(!ad.endDate||ad.endDate<=new Date())) throw new Error('This campaign has ended.');
  const settings=await prisma.appSettings.findUnique({where:{id:1},select:{usdToKesRate:true}});
  const fx=Number(settings?.usdToKesRate??0);
  if(paystack.enabled&&fx<=0) throw new Error('Configure the USD/KES exchange rate first.');
  const funding=await prisma.adFunding.upsert({where:{campaignId_requestKey:{campaignId,requestKey}},
    create:{campaignId,requestKey,amountCents:Number(ad.budgetMicros/10000n),provider:paystack.enabled?'PAYSTACK':'STRIPE',
      amountLocalCents:paystack.enabled?Math.ceil(Number(ad.budgetMicros)/1e6*fx*100):null},update:{}});
  if(funding.paidAt) return {paid:true};
  if(funding.provider==='PAYSTACK'&&!paystack.enabled) throw new Error('The selected gateway is unavailable.');
  if(funding.provider==='STRIPE'&&(!config.enabled||!config.webhookSecret)) throw new Error('The selected gateway is unavailable.');
  if(funding.checkoutUrl) return {url:funding.checkoutUrl};
  if(funding.provider==='PAYSTACK') {
    if(!paystack.enabled) throw new Error('The selected gateway is unavailable.');
    const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{email:true}});
    if(!user.email) throw new Error('Add an email to your account before checkout.');
    const checkout=await initializePaystackTransaction({reference:`adfund_${funding.id}`,amountKes:funding.amountLocalCents!/100,email:user.email,callbackUrl:`${origin}/ad-checkout`});
    await prisma.adFunding.update({where:{id:funding.id},data:{checkoutUrl:checkout.authorizationUrl}});
    return {url:checkout.authorizationUrl};
  }
  if(!config.enabled||!config.webhookSecret) throw new Error('The selected gateway is unavailable.');
  const body=new URLSearchParams({mode:'payment',success_url:`${origin}/ad-checkout?result=complete`,cancel_url:`${origin}/ad-checkout?result=cancelled`,
    client_reference_id:funding.id,'line_items[0][price_data][currency]':'usd',
    'line_items[0][price_data][unit_amount]':String(funding.amountCents),
    'line_items[0][price_data][product_data][name]':`ChatAndTip promotion: ${ad.name}`,
    'line_items[0][quantity]':'1','metadata[purpose]':'ad_funding','metadata[fundingId]':funding.id,'metadata[userId]':userId});
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${config.secretKey}`,
    'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`ad-funding-${funding.id}`},body,cache:'no-store'});
  const session=await response.json();
  if(!response.ok||!session.id||!session.url) throw new Error('Unable to start checkout. Please retry.');
  await prisma.adFunding.update({where:{id:funding.id},data:{stripeSessionId:session.id,checkoutUrl:session.url}});
  return {url:session.url};
}
export async function fulfillAdFunding(session:{id:string;payment_status?:string;currency?:string|null;amount_total?:number|null;metadata?:Record<string,string>}) {
  if(session.payment_status!=='paid') return;
  await prisma.$transaction(async tx=>{
    const id=session.metadata?.fundingId??'';
    await tx.$queryRaw`SELECT id FROM AdFunding WHERE id=${id} FOR UPDATE`;
    const funding=await tx.adFunding.findUniqueOrThrow({where:{id},include:{campaign:true}});
    if(funding.provider!=='STRIPE'||funding.stripeSessionId!==session.id||session.currency!=='usd'||session.amount_total!==funding.amountCents||session.metadata?.userId!==funding.campaign.ownerId)
      throw new Error('Ad payment verification mismatch');
    if(funding.paidAt) return;
    await tx.adFunding.update({where:{id},data:{paidAt:new Date()}});
    await applyAdFunding(tx, funding);
  });
}

export async function fulfillPaystackAd(data:{reference?:string;status?:string;currency?:string;amount?:number}) {
  if(data.status!=='success'||!data.reference?.startsWith('adfund_')) return;
  await prisma.$transaction(async tx=>{
    const id=data.reference!.slice(7);
    await tx.$queryRaw`SELECT id FROM AdFunding WHERE id=${id} FOR UPDATE`;
    const funding=await tx.adFunding.findUniqueOrThrow({where:{id},include:{campaign:true}});
    if(funding.provider!=='PAYSTACK'||data.currency?.toUpperCase()!=='KES'||data.amount!==funding.amountLocalCents)throw new Error('Ad payment verification mismatch');
    if(funding.paidAt)return;
    await tx.adFunding.update({where:{id},data:{paidAt:new Date()}});
    await applyAdFunding(tx, funding);
  });
}

async function applyAdFunding(tx:any, funding:any) {
  const campaign=funding.campaign;
  const now=new Date();
  const depleted=campaign.fundedMicros<=campaign.spentMicros;
  const canResume=depleted&&campaign.status==='PAUSED'&&campaign.reviewStatus==='APPROVED'&&
    campaign.startDate&&campaign.startDate<=now&&campaign.endDate&&campaign.endDate>now;
  await tx.adCampaign.update({where:{id:funding.campaignId},data:{
    checkoutPaid:true,
    fundedMicros:{increment:BigInt(funding.amountCents)*10000n},
    ...(canResume?{status:'ACTIVE'}:{}),
  }});
}

export async function verifyPaystackAdReference(reference:string) {
  if(!reference.startsWith('adfund_')) return false;
  const config=await resolvePaystackConfig();
  if(!config.enabled) return false;
  const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{
    headers:{Authorization:`Bearer ${config.secretKey}`},cache:'no-store',
  });
  if(!response.ok) return false;
  const result=await response.json() as {status?:boolean;data?:{reference?:string;status?:string;currency?:string;amount?:number}};
  const payment=result.data;
  if(!result.status||payment?.reference!==reference||payment.status!=='success') return false;
  await fulfillPaystackAd({reference:payment.reference,status:payment.status,currency:payment.currency,amount:payment.amount});
  return true;
}

export async function reconcilePendingPaystackAdFunding(campaignIds:string[]) {
  if(!campaignIds.length) return;
  const pending=await prisma.adFunding.findMany({where:{
    campaignId:{in:campaignIds},provider:'PAYSTACK',paidAt:null,
    createdAt:{gte:new Date(Date.now()-7*86400000)},
  },orderBy:{createdAt:'desc'},take:10,select:{id:true}});
  for(const funding of pending) {
    try { await verifyPaystackAdReference(`adfund_${funding.id}`); } catch { /* A webhook can still settle it later. */ }
  }
}
