import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

async function harness(entry: string, prisma: any) {
  const events: any[] = [];
  const mocks = { prisma, emit: (...args: any[]) => events.push(args) };
  const exports: Record<string, string> = {
    prisma: 'export const prisma = __mocks.prisma; export const withDbRetry = (fn) => fn();',
    env: 'export const env = {JWT_SECRET:"test"};',
    realtime: 'export const emitChatRealtimeToUser = __mocks.emit;',
    'mobile-users': 'export const serializeMobileUser = (x) => x;',
    r2: 'export const getSignedPrivateR2DownloadUrl = async (x) => x;',
    'mobile-notifications': 'export const createUserNotification = () => { throw new Error("Chat privacy must not send external notifications"); }; export const sendDirectMessagePush = () => {};',
    'mobile-credits': 'export const consumeCreditInTransaction = () => {}; export const getCreditBalances = () => {}; export const ON_ACCOUNT_VALUE_KES = 1;',
    'mobile-chat-privacy': 'export const expirePendingHideRequests = () => {}; export const expireUnansweredUnhideRequests = () => {};',
    'chat-hide-request-status': 'export const chatHideRequestMessageText = (text, request) => { const status = request.status === "ACCEPTED" ? "ACCEPTED" : request.status === "DECLINED" ? "DECLINED" : request.status === "EXPIRED" ? (text?.endsWith(":WITHDRAWN") ? "WITHDRAWN" : "EXPIRED") : "PENDING"; return `CHAT_${request.action === "UNHIDE_FOR_ALL" ? "UNHIDE" : "HIDE"}_REQUEST:${status}`; };',
    'chat-media-token': 'export const sealChatMedia = (payload) => `sealed-${payload.messageId}`;',
    'mobile-chats': 'export const getOrCreateThread = async () => {};',
    email: 'export const sendEmail = () => {};',
    fcm: 'export const sendCallStateFcm = () => {};',
  };
  const result = await build({entryPoints:[entry], bundle:true, write:false,
    platform:'node', format:'cjs', packages:'external', plugins:[{
      name:'boundaries', setup(b) {
        b.onResolve({filter:/^(server-only|@\/lib\/)/}, ({path}) => ({path,namespace:'mock'}));
        b.onLoad({filter:/.*/,namespace:'mock'}, ({path}) => ({contents:path === 'server-only' ? '' : exports[path.split('/').at(-1)!]}));
      },
    }],
  });
  const module = {exports:{} as any};
  new Function('require','module','exports','__mocks',result.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`),module,module.exports,mocks);
  return {api:module.exports,events};
}

test('expired unhide keeps both people hidden until mutual consent', async () => {
  const changes: any[] = [];
  let changed = true;
  const db: any = {
    chatHideRequest: {
      findMany: async () => [{id:'r', requesterId:'a', recipientId:'b', threadId:'t'}],
      updateMany: async () => ({count: changed ? 1 : 0}),
    },
    chatMessage: {updateMany: async (q:any) => {changes.push(['notice',q]);}},
    userHiddenChat: {
      deleteMany: async (q:any) => {changes.push(['delete',q]);},
      updateMany: async (q:any) => {changes.push(['update',q]);},
    },
    userNotification: {updateMany:async()=>{}},
  };
  db.$transaction = (fn:any)=>fn(db);
  const {api,events} = await harness('lib/mobile-chat-privacy.ts',db);
  await api.expireUnansweredUnhideRequests('a');
  assert.equal(changes.some(([type])=>type==='delete'||type==='update'),false);
  assert.deepEqual(events.map(([id])=>id),['a','b']);
  changed = false;
  await api.expireUnansweredUnhideRequests('a');
  assert.equal(events.length,2);
});

test('withdrawing a pending hide restores the requester before broadcasting the withdrawn notice', async () => {
  let hidden = true;
  let notice = '';
  const db: any = {
    chatHideRequest: {findMany: async () => [{id:'r',recipientId:'b'}], updateMany:async()=>({count:1})},
    userHiddenChat: {deleteMany:async()=>{hidden=false;}},
    chatMessage: {
      updateMany:async({data}:any)=>{notice=data.text;},
      findFirst:async()=>({id:'m',senderId:'a',sentAt:new Date()}),
    },
    userNotification:{updateMany:async()=>{}},
  };
  db.$transaction=(fn:any)=>fn(db);
  const {api,events}=await harness('lib/mobile-chat-privacy.ts',db);
  assert.equal(await api.cancelPendingHideRequest('a','t','WITHDRAWN'),true);
  assert.equal(hidden,false);
  assert.equal(notice,'CHAT_HIDE_REQUEST:WITHDRAWN');
  assert.equal(events.filter(([,event])=>event.type==='message_updated').length,2);
});

test('accepting a request withdrawn after the initial read cannot hide the recipient', async () => {
  const db:any = {
    chatHideRequest:{
      findUnique:async()=>({id:'r',requesterId:'a',recipientId:'b',threadId:'t',status:'PENDING',action:'HIDE_FOR_ALL'}),
      updateMany:async()=>({count:0}),
    },
    userHiddenChat:{findUnique:async()=>({id:'h'}),upsert:async()=>assert.fail('Recipient must stay visible')},
  };
  db.$transaction=(fn:any)=>fn(db);
  const {api,events}=await harness('lib/mobile-chat-privacy.ts',db);
  await assert.rejects(api.respondToHideRequest('b','r',true,'1234'),/withdrawn/);
  assert.equal(events.length,0);
});

test('only accepted unhide removes the shared hidden state', async () => {
  for (const accept of [false,true]) {
    let removed=false;
    const db:any={
      chatHideRequest:{findUnique:async()=>({id:'r',requesterId:'a',recipientId:'b',threadId:'t',status:'PENDING',action:'UNHIDE_FOR_ALL'}),updateMany:async()=>({count:1})},
      chatMessage:{findFirst:async()=>null},
      userHiddenChat:{deleteMany:async()=>{removed=true;}},
    };
    db.$transaction=(fn:any)=>fn(db);
    const {api}=await harness('lib/mobile-chat-privacy.ts',db);
    await api.respondToHideRequest('b','r',accept);
    assert.equal(removed,accept);
  }
});

test('hide for all hides requester first and acceptance hides recipient too', async () => {
  const hidden = new Map<string,string>();
  let request:any;
  const db:any={
    user:{findUnique:async()=>({accountType:'INDIVIDUAL'})},
    chatParticipant:{findFirst:async()=>({threadId:'t'}),updateMany:async()=>({count:1})},
    chatThread:{findUnique:async()=>({id:'t',kind:'DIRECT',broadcastOnly:false})},
    chatPrivateCodeGroup:{upsert:async({create}:any)=>({id:`code-${create.userId}`})},
    userHiddenChat:{
      findFirst:async()=>null,
      findUnique:async()=>({id:'hidden-a'}),
      upsert:async({create,update}:any)=>{hidden.set(create.userId,create.codeGroupId);return update;},
      updateMany:async({where}:any)=>{hidden.set(where.userId,'shared');return {count:1};},
    },
    chatHideRequest:{
      findFirst:async()=>null,
      create:async({data}:any)=>{request={id:'r',status:'PENDING',...data};return request;},
      findUnique:async()=>request,
      updateMany:async({data}:any)=>{Object.assign(request,data);return {count:1};},
    },
    chatMessage:{
      findFirst:async()=>request?.status==='ACCEPTED'?null:null,
      create:async({data}:any)=>({id:'m',...data}),
    },
    userNotification:{updateMany:async()=>({count:0})},
    tip:{findMany:async()=>[]},callBooking:{findMany:async()=>[]},creditLedger:{findMany:async()=>[]},
  };
  db.$transaction=(fn:any)=>fn(db);
  const {api}=await harness('lib/mobile-chat-privacy.ts',db);
  const pending=await api.requestHideForAll('a','b','1234');
  assert.equal(pending.hidden,true);
  assert.deepEqual([...hidden.keys()],['a']);
  await api.respondToHideRequest('b','r',true,'5678');
  assert.deepEqual([...hidden.keys()].sort(),['a','b']);
  assert.equal(request.status,'ACCEPTED');
});

test('declining hide for all keeps the requester hidden and recipient public', async () => {
  let status='';
  let messageText='';
  const db:any={
    chatHideRequest:{
      findUnique:async()=>({id:'r',requesterId:'a',recipientId:'b',threadId:'t',status:'PENDING',action:'HIDE_FOR_ALL'}),
      updateMany:async({data}:any)=>{status=data.status;return {count:1};},
    },
    chatMessage:{
      findFirst:async()=>({id:'m',senderId:'a',type:'SYSTEM',sentAt:new Date()}),
      update:async({data}:any)=>{messageText=data.text;},
    },
    userHiddenChat:{deleteMany:async()=>assert.fail('Decline must not reveal the requester chat')},
  };
  db.$transaction=(fn:any)=>fn(db);
  const {api,events}=await harness('lib/mobile-chat-privacy.ts',db);
  await api.respondToHideRequest('b','r',false);
  assert.equal(status,'DECLINED');
  assert.equal(messageText,'CHAT_HIDE_REQUEST:DECLINED');
  assert.deepEqual(
    events.filter(([,event])=>event.type==='message_updated').map(([user])=>user),
    ['a','b'],
  );
});

test('anonymous enable locks the mapped users table and persists the flag', async () => {
  let saved = false;
  const db: any = {
    user:{count:async()=>2},
    $queryRaw:async (sql:TemplateStringsArray)=>{
      assert.match(sql.join('?'), /FROM users WHERE/);
      assert.match(readFileSync('prisma/schema.prisma','utf8'), /@@map\("users"\)/);
    },
    userBlock:{findFirst:async()=>null},
    chatParticipant:{findFirst:async()=>({id:'p'}),update:async({data}:any)=>{saved=data.anonymous;}},
  };
  db.$transaction = (fn:any)=>fn(db);
  const {api,events} = await harness('lib/mobile-chat-privacy.ts',db);
  await api.setChatAnonymous('sender','peer',true);
  assert.equal(saved,true);
  assert.equal(events.length,2);
});

test('delete for both rejects received messages without modifying data', async () => {
  const db = {
    chatMessage:{findUnique:async()=>({id:'m',senderId:'peer',threadId:'t',type:'TEXT',thread:{kind:'DIRECT',broadcastOnly:false}})},
    chatParticipant:{findFirst:async()=>({threadId:'t'})},
  };
  const {api,events} = await harness('lib/mobile-chats.ts',db);
  await assert.rejects(api.deleteMessage('sender','peer','m','both'), /Only your own/);
  assert.equal(events.length,0);
});

test('delete for both removes original and quotes, notifying both without a notice', async () => {
  let removed = false;
  let quotesCleared = false;
  let lookups = 0;
  const db:any = {
    chatMessage:{
      findUnique:async()=>({id:'m',senderId:'sender',threadId:'t',type:'TEXT',thread:{kind:'DIRECT',broadcastOnly:false}}),
      updateMany:async({data}:any)=>{quotesCleared=data.replyToText === null;},
      deleteMany:async({where}:any)=>{assert.equal(where.senderId,'sender');removed=true;},
    },
    chatParticipant:{findFirst:async()=>++lookups === 1 ? {threadId:'t'} : null},
    user:{findFirst:async()=>null},
  };
  db.$transaction = (fn:any)=>fn(db);
  const {api,events} = await harness('lib/mobile-chats.ts',db);
  await api.deleteMessage('sender','peer','m','both');
  assert.ok(removed && quotesCleared);
  assert.deepEqual(events.map(([user,event])=>[user,event.type]),[['sender','message_deleted'],['peer','message_deleted']]);
});

test('joining locks against expiry and preserves the first attendance timestamp', async () => {
  const first = new Date(Date.now()-1000);
  let locked = false;
  const db:any = {
    $queryRaw:async()=>{locked=true;},
    callBooking:{findUnique:async()=>{
      assert.ok(locked);
      return {id:'b',customerId:'customer',creatorId:'creator',status:'LIVE',creator:{},
        scheduledStart:new Date(Date.now()-60000),scheduledEnd:new Date(Date.now()+60000),creatorJoinedAt:first};
    },update:async({data}:any)=>{assert.equal(data.creatorJoinedAt,first);return data;}},
  };
  db.$transaction = (fn:any)=>fn(db);
  const {api}=await harness('lib/mobile-bookings.ts',db);
  await api.joinBooking('creator','b');
});
