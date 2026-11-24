// Creates isolated fixtures only; deletes those fixtures in finally.
// BASE=http://localhost:3006 node scripts/with-env-file.mjs .env.railway node scripts/verify-vault-folders.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
const db=new PrismaClient(), base=process.env.BASE||'http://localhost:3006';
const ids=[], threadIds=[];let passed=0;
const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log(`PASS ${label}`)};
const token=async id=>new SignJWT({userId:id,loginProvider:'email'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('30m').sign(new TextEncoder().encode(process.env.JWT_SECRET));
async function request(auth,path,body,method='POST') {
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(method==='GET'||method==='DELETE'?{}:{body:JSON.stringify(body)})});
 let data;try{data=await r.json()}catch{data={}}
 return {status:r.status,body:data,headers:r.headers};
}
try {
 const unique=randomUUID().slice(0,8);
 for(let n=0;n<2;n++) {const u=await db.user.create({data:{fullName:`Vault folder QA ${unique}-${n}`,gender:'other',externalId:`vault-qa:${unique}:${n}`}});ids.push(u.id)}
 const auth=await token(ids[0]), other=await token(ids[1]);
 const endpoint='/api/mobile/vault/folders';
 const act=(code,action,values={},who=auth)=>request(who,endpoint,{code,action,...values});
 let r=await request(null,endpoint,{code:'1111',action:'list'});check(r.status===401,'anonymous requests rejected');
 r=await act('1111','initialize');check(r.status===200,'first code initialises');
 r=await act('2222','initialize');check(r.status===200,'second code initialises');
 r=await act('1111','list');check(r.status===200&&r.body.data.folders.length===6,'default root plus five categories');
 check(r.headers.get('cache-control')?.includes('no-store'),'private response cannot be cached');
 const a=r.body.data.folders, root=a.find(f=>f.systemKey==='default'), images=a.find(f=>f.systemKey==='Images');
 const b=(await act('2222','list')).body.data.folders;
 check(a.every(f=>!b.some(x=>x.id===f.id)),'different codes have disjoint folders');
 r=await act('9999','list');check(r.status===404&&!r.body.data,'unknown code returns no metadata');
 r=await act('1111','list',{},other);check(r.status===404,'same PIN on another account exposes nothing');
 r=await act('1111','create',{name:'Travel'});check(r.status===200,'root folder created');const travel=r.body.data.folder;
 r=await act('1111','create',{name:'Tickets',parentId:travel.id});check(r.status===200,'subfolder created');const tickets=r.body.data.folder;
 r=await act('1111','renameFolder',{folderId:root.id,name:'Personal'});check(r.status===200,'default folder can be renamed');
 r=await act('1111','renameFolder',{folderId:images.id,name:'Photos'});check(r.status===200,'category can be renamed');
 r=await act('1111','create',{name:'Travel'});check(r.status===409,'duplicate sibling name rejected');
 r=await act('1111','create',{name:'bad/name'});check(r.status===400,'invalid names rejected');
 for(const action of ['renameFolder','create']) {
  r=await act('1111',action,{name:'LEAK',...(action==='create'?{parentId:b[0].id}:{folderId:b[0].id})});check(r.status===404,`${action} rejects another code folder`);
 }
 r=await act('1111','renameFolder',{name:'LEAK',folderId:root.id},other);check(r.status===404,'foreign account folder rename rejected');
 const thread=await db.chatThread.create({data:{kind:'SELF',initiatorId:ids[0],participants:{create:{userId:ids[0],otherUserId:ids[0]}}}});threadIds.push(thread.id);
 const make=(type,name)=>db.chatMessage.create({data:{threadId:thread.id,senderId:ids[0],type,text:'__CHATANDTIP_VAULT_DIRECT_UPLOAD__',documentName:name,...(type==='IMAGE'?{imageUrl:'https://example.invalid/qa.jpg'}:{documentMimeType:'application/pdf'})}});
 const m=await make('DOCUMENT','Ticket.pdf'), photo=await make('IMAGE','Photo.jpg');
 const move=(code,messageIds,folderId)=>request(auth,'/api/mobile/secure-folder',{otherUserId:ids[0],code,confirmCode:code,messageIds,...(folderId?{folderId}:{})});
 r=await move('1111',[m.id],tickets.id);check(r.status===200,'upload save uses chosen destination');
 r=await move('1111',[photo.id]);check(r.status===200,'automatic category upload accepted');
 r=await act('1111','list');let items=r.body.data.items;
 const doc=items.find(i=>i.message.id===m.id), img=items.find(i=>i.message.id===photo.id);
 check(doc.peer.userId===ids[0]&&doc.peer.id===ids[0],'saved conversation peer supports current and older clients');
 check(doc.folderId===tickets.id,'chosen folder persists after reload');
 check(img.folderId===images.id,'renamed category still receives automatic uploads');
 check((await act('2222','list')).body.data.items.length===0,'other code lists none of first code files');
 r=await act('1111','renameItem',{itemIds:[doc.id],name:'Boarding pass.pdf'});check(r.status===200,'uploaded file renamed');
 check((await db.chatMessage.findUnique({where:{id:m.id}})).documentName==='Ticket.pdf','rename does not alter original chat message');
 r=await act('1111','moveItems',{itemIds:[doc.id,img.id],folderId:travel.id});check(r.status===200,'bulk move within code works');
 items=(await act('1111','list')).body.data.items;
 check(items.every(i=>i.folderId===travel.id)&&items.some(i=>i.message.documentName==='Boarding pass.pdf'),'move and rename survive fresh read');
 r=await act('1111','moveItems',{itemIds:[doc.id],folderId:b[0].id});check(r.status===404,'move to other code rejected');
 for(const action of ['renameItem','moveItems']) {
  r=await act('2222',action,{itemIds:[doc.id],...(action==='renameItem'?{name:'LEAK'}:{folderId:b[0].id})});check(r.status===404,`${action} rejects other code item`);
  r=await act('1111',action,{itemIds:[doc.id],...(action==='renameItem'?{name:'LEAK'}:{folderId:travel.id})},other);check(r.status===404,`${action} rejects other account item`);
 }
 r=await act('1111','moveItems',{itemIds:[doc.id,'unknown-item'],folderId:tickets.id});check(r.status===404,'mixed valid and invalid bulk move rejected atomically');
 check((await act('1111','list')).body.data.items.find(i=>i.id===doc.id).folderId===travel.id,'failed bulk move changed nothing');
 const extra=await make('DOCUMENT','Unfiled.pdf');
 r=await move('1111',[extra.id],b[0].id);check(r.status===404,'upload cannot target another code folder');
 check(!await db.secureFolderMessage.findFirst({where:{messageId:extra.id}}),'rejected destination creates no vault copy');
 r=await move('2222',[doc.message.id]);check(r.status===404,'existing private copy cannot be imported through another code');
 r=await request(auth,'/api/mobile/chats/hidden',{action:'change_vault_code',currentCode:'1111',nextCode:'3333'});
 check(r.status===200,'whole-vault code change succeeds');
 check((await act('1111','list')).status===404,'old code no longer opens renamed vault');
 const changed=(await act('3333','list')).body.data;
 check(changed.folders.some(f=>f.id===travel.id)&&changed.items.find(i=>i.id===doc.id).folderId===travel.id,'code change preserves folders and file placements');
 console.log(`${passed} vault-folder HTTP checks passed`);
} finally {
 // All identifiers originate from this run. Never clear real customer content.
 const owned=await db.chatThread.findMany({where:{participants:{some:{userId:{in:ids}}}},select:{id:true}});
 await db.chatThread.deleteMany({where:{id:{in:owned.map(t=>t.id)}}});
 await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
 console.log('Isolated test accounts and messages removed');
}
