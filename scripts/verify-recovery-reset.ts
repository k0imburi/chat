import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prisma} from '../lib/prisma';
import {hideChatForMe,manageVaultFolders} from '../lib/mobile-chat-privacy';
const ids:string[]=[];
async function main(){try{
 for(let i=0;i<2;i++) ids.push((await prisma.user.create({data:{fullName:'Recovery QA',gender:'other',externalId:'recovery-qa:'+randomUUID()}})).id);
 await prisma.chatThread.create({data:{kind:'DIRECT',initiatorId:ids[0],participants:{create:[{userId:ids[0],otherUserId:ids[1]},{userId:ids[1],otherUserId:ids[0]}]}}});
 await manageVaultFolders(ids[0],{action:'initialize',code:'2468'});
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
 console.log('PASS recovery delivery reissued exactly once, token and hidden chat preserved, no notification created');
}finally{await prisma.chatThread.deleteMany({where:{participants:{some:{userId:{in:ids}}}}});await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();console.log('QA fixtures removed');}}
main();
