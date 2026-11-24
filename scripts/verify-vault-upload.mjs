import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {SignJWT} from 'jose';
import {S3Client,DeleteObjectCommand} from '@aws-sdk/client-s3';
const db=new PrismaClient(),base=process.env.BASE||'http://localhost:3017';let user,objectKey,webKey,docKey;let passed=0;
const check=(v,label)=>{assert.ok(v,label);passed++;console.log('PASS '+label)};
let auth;
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});return {status:r.status,data:await r.json()}}
try {
 user=await db.user.create({data:{fullName:'Vault upload QA',gender:'other',externalId:'vault-upload-qa:'+randomUUID()}});
 auth=await new SignJWT({userId:user.id,loginProvider:'email'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('30m').sign(new TextEncoder().encode(process.env.JWT_SECRET));
 const folder=async(code,action,extra={})=>post('/api/mobile/vault/folders',{code,action,...extra});
 check((await folder('1357','initialize')).status===200,'initialize vault for upload');
 check((await folder('2468','initialize')).status===200,'initialize another code');
 const folders=(await folder('1357','list')).data.data.folders;
 check(folders.find(f=>f.systemKey==='default')?.name==='Folder 1','new default folder is Folder 1');
 const destination=folders.find(f=>f.systemKey==='Images');
 const otherFolder=(await folder('2468','list')).data.data.folders[0];
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
 const presign=await post('/api/mobile/storage/presign',{filename:'vault-qa.png',dir_name:'vault',visibility:'private',size_bytes:bytes.length});
 check(presign.status===200,'private upload reserved within quota');objectKey=presign.data.object_key;
 const put=await fetch(presign.data.upload_url,{method:'PUT',headers:{'Content-Type':presign.data.content_type,Origin:'https://www.chatandtip.com'},body:bytes});
 check(put.ok,'real image bytes uploaded to private storage');

 const confirmed=await post('/api/mobile/storage/presign/confirm',{object_key:objectKey,content_type:presign.data.content_type,size_bytes:bytes.length,dir_name:'vault',visibility:'private'});
 check(confirmed.status===200,'private upload confirmed');
 const save=async(code,folderId)=>post('/api/mobile/vault/files',{code,folderId,objectKey,name:'Private photo.png'});
 check((await save('1357',otherFolder.id)).status===404,'atomic save rejects folder from another code');
 check(await db.chatMessage.count({where:{senderId:user.id,imageObjectKey:objectKey}})===0,'failed save leaves no ordinary chat message');
 let saved=await save('1357',destination.id);check(saved.status===200,'file and folder placement saved atomically');
 const itemId=saved.data.data.itemId,messageId=saved.data.data.messageId;
 check((await save('1357',destination.id)).data.data.itemId===itemId,'retry is idempotent');
 check((await save('2468',otherFolder.id)).status===404,'same asset cannot leak into another code');
 let list=(await folder('1357','list')).data.data.items;
 const item=list.find(i=>i.id===itemId);check(item?.folderId===destination.id,'real uploaded file visible in chosen folder');
 const media=await fetch(item.message.imageUrl);check(media.ok&&Buffer.from(await media.arrayBuffer()).equals(bytes),'preview/share source returns original image bytes');
 check((await folder('2468','list')).data.data.items.length===0,'other code has no uploaded file or preview');
 const chat=await fetch(base+'/api/mobile/chats/'+user.id+'/messages',{headers:{Authorization:`Bearer ${auth}`}});const chatBody=await chat.json();
 check(chat.ok&&!JSON.stringify(chatBody.data).includes(messageId),'ordinary self-chat does not expose vault upload');
 for(const action of ['restore','delete']) {
  const denied=await post('/api/mobile/secure-folder',{action,code:'2468',messageId});check(denied.status===(action==='delete'?403:404),`wrong code cannot ${action} uploaded file`);
 }
 check((await folder('1357','renameItem',{itemIds:[itemId],name:'Renamed photo.png'})).status===200,'real uploaded file can be renamed');
 check((await folder('1357','list')).data.data.items[0].message.documentName==='Renamed photo.png','new filename available to sharing');
 const removed=await post('/api/mobile/secure-folder',{action:'delete',code:'1357',messageId});check(removed.status===403,'deletion is forbidden even with the correct code');
 check((await folder('1357','list')).data.data.items.some(i=>i.id===itemId),'blocked deletion preserves the file');
 const legacyDelete=await fetch(base+'/api/mobile/secure-folder?'+new URLSearchParams({action:'delete',code:'1357',messageId}),{method:'DELETE',headers:{Authorization:`Bearer ${auth}`}});check(legacyDelete.status===403,'legacy clients cannot delete vault media');
 const form=new FormData();form.set('dir_name','vault');form.set('visibility','private');form.set('file',new Blob([bytes],{type:'image/png'}),'web-photo.png');
 const webResponse=await fetch(base+'/api/mobile/storage/upload',{method:'POST',headers:{Authorization:`Bearer ${auth}`},body:form});const webUpload=await webResponse.json();
 check(webResponse.ok,'browser multipart upload succeeds without storage CORS');
 webKey=webUpload.object_key;
 const webSave=await post('/api/mobile/vault/files',{code:'1357',objectKey:webKey,name:'Web photo.png',folderId:destination.id});
 check(webSave.status===200,'encrypted browser upload saved into chosen folder');
 const webItem=(await folder('1357','list')).data.data.items.find(i=>i.id===webSave.data.data.itemId);
 const webMedia=await fetch(webItem.message.imageUrl);check(webMedia.ok&&Buffer.from(await webMedia.arrayBuffer()).equals(bytes),'encrypted browser preview returns original bytes');
 const docForm=new FormData();docForm.set('dir_name','vault');docForm.set('visibility','private');docForm.set('file',new Blob(['Vault document QA'],{type:'text/plain'}),'qa-note.txt');
 const docResponse=await fetch(base+'/api/mobile/storage/upload',{method:'POST',headers:{Authorization:`Bearer ${auth}`},body:docForm});const docUpload=await docResponse.json();
 check(docResponse.ok,'browser document upload succeeds');docKey=docUpload.object_key;
 const docSave=await post('/api/mobile/vault/files',{code:'1357',objectKey:docKey,name:'Note.txt'});check(docSave.status===200,'document auto-categorised and saved');
 const docItem=(await folder('1357','list')).data.data.items.find(i=>i.id===docSave.data.data.itemId);
 check(docItem.folderId===folders.find(f=>f.systemKey==='Documents').id,'document uses Documents category');
 const docMedia=await fetch(docItem.message.documentUrl);check(docMedia.ok&&await docMedia.text()==='Vault document QA','document is available for private sharing');
 console.log(`${passed} real-upload HTTP checks passed`);
} finally {
 if(user) {
  if(objectKey) {
   const s=await db.appSettings.findUnique({where:{id:1}});
   const client=new S3Client({region:s?.r2Region||process.env.R2_REGION||'auto',endpoint:s?.r2Endpoint||process.env.R2_ENDPOINT||`https://${s?.r2AccountId||process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:s?.r2AccessKeyId||process.env.R2_ACCESS_KEY_ID,secretAccessKey:s?.r2SecretAccessKey||process.env.R2_SECRET_ACCESS_KEY}});
   assert.ok(objectKey.startsWith(`private/${user.id}/vault/`));
   await client.send(new DeleteObjectCommand({Bucket:s?.r2PrivateBucketName||process.env.R2_PRIVATE_BUCKET_NAME||s?.r2BucketName||process.env.R2_BUCKET_NAME,Key:objectKey}));
   await db.asset.deleteMany({where:{objectKey}});
   for(const key of [webKey,docKey].filter(Boolean)) {
    const owned=await db.vaultUploadLedger.findFirst({where:{userId:user.id,objectKey:key}});assert.ok(owned);
    await client.send(new DeleteObjectCommand({Bucket:s?.r2BucketName||process.env.R2_BUCKET_NAME,Key:key}));
    await db.asset.deleteMany({where:{objectKey:key}});
   }
  }
  await db.vaultUploadLedger.deleteMany({where:{userId:user.id}});
  const threads=await db.chatThread.findMany({where:{participants:{some:{userId:user.id}}},select:{id:true}});
  await db.chatThread.deleteMany({where:{id:{in:threads.map(t=>t.id)}}});await db.user.delete({where:{id:user.id}});
 }
 await db.$disconnect();console.log('Temporary account and uploaded test image removed');
}
