import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {SignJWT} from 'jose';
const prisma=new PrismaClient();
const base=process.env.BASE||'https://www.chatandtip.com';
async function request(userId,path,body){
 const token=await new SignJWT({userId,loginProvider:'email'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(process.env.JWT_SECRET));
 const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
async function hideChatForMe(userId,otherUserId,code){const r=await request(userId,'/api/mobile/chats/'+otherUserId+'/hide',{action:'hide_for_me',code});assert.equal(r.status,200);}

const ids=[];
async function main(){try{
 for(let i=0;i<2;i++) ids.push((await prisma.user.create({data:{fullName:'Recovery QA',gender:'other',externalId:'recovery-qa:'+randomUUID()}})).id);
 await prisma.chatThread.create({data:{kind:'DIRECT',initiatorId:ids[0],participants:{create:[{userId:ids[0],otherUserId:ids[1]},{userId:ids[1],otherUserId:ids[0]}]}}});
 assert.equal((await request(ids[0],'/api/mobile/vault/folders',{action:'initialize',code:'2468'})).status,200);
 assert.equal(await prisma.privateCodeRecovery.count({where:{userId:ids[0]}}),0);
 await hideChatForMe(ids[0],ids[1],'1357');
 const before=await prisma.privateCodeRecovery.findUniqueOrThrow({where:{userId:ids[0]}});
 await prisma.privateCodeRecovery.update({where:{userId:ids[0]},data:{issuedAt:new Date('2026-11-23T00:00:00Z')}});
 const count=()=>prisma.chatMessage.count({where:{thread:{kind:'BROADCAST',participants:{some:{userId:ids[0]}}}}});
 const oldCount=await count();
 await hideChatForMe(ids[0],ids[1],'1357');
 const after=await prisma.privateCodeRecovery.findUniqueOrThrow({where:{userId:ids[0]}});
 assert.equal(after.encryptedToken,before.encryptedToken);assert(after.issuedAt.getTime()>Date.now()-60000);assert.equal(await count(),oldCount+1);
 await hideChatForMe(ids[0],ids[1],'1357');assert.equal(await count(),oldCount+1);
 assert.equal(await prisma.userNotification.count({where:{userId:ids[0]}}),0);
 assert.equal(await prisma.userHiddenChat.count({where:{userId:ids[0]}}),1);
 const endpoint='/api/mobile/private-code-recovery';
 const broadcast=await request(ids[0],endpoint,{action:'broadcast'});assert.equal(broadcast.status,200);
 const code=broadcast.body.data.code;assert.match(code,/^RCT-[a-f0-9]{48}$/);
 assert(broadcast.body.data.expiresAt>Date.now() && broadcast.body.data.expiresAt<Date.now()+20*60*1000);
 const recovered=await request(ids[0],endpoint,{code});assert.equal(recovered.status,200);assert(recovered.body.data.some(x=>x.code==='1357'));
 assert.notEqual((await request(ids[1],endpoint,{code})).status,200);
 await prisma.privateCodeRecovery.update({where:{userId:ids[0]},data:{issuedAt:new Date(Date.now()-21*60*1000)}});
 assert.equal((await request(ids[0],endpoint,{action:'broadcast'})).status,404);
 assert.equal((await request(ids[0],endpoint,{code})).status,200);
 console.log('PASS live recovery lookup, account isolation, 20-minute broadcast expiry and persistent saved recovery code');
 console.log('PASS recovery delivery reissued exactly once, token and hidden chat preserved, no notification created');
}finally{await prisma.chatThread.deleteMany({where:{participants:{some:{userId:{in:ids}}}}});await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();console.log('QA fixtures removed');}}
main();
