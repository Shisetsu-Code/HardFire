'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PageConnection}=require('../src/page-connection');
const {ElementReferences}=require('../src/element-references');
function fixture() {
  const wc=new EventEmitter();let attached=false;let removed=false;const calls=[];
  const dbg=new EventEmitter();Object.assign(dbg,{isAttached:()=>attached,attach:()=>{attached=true;},detach:()=>{attached=false;},
    sendCommand:async(method,params,session)=>{
      calls.push([method,session]);
      if(method==='Page.getFrameTree')return {frameTree:{frame:{id:session?'child':'root',url:'https://test/'}}};
      if(method==='DOM.resolveNode'){if(removed)throw new Error('No node');return {object:{objectId:'node'}};}
      if(method==='Runtime.callFunctionOn')return {result:{value:!removed}};
      return {};
    }});
  Object.assign(wc,{debugger:dbg,isDestroyed:()=>false});
  const connection=new PageConnection(wc);
  return {wc,dbg,calls,connection,remove:()=>{removed=true;}};
}
test('shared leases do not detach while another consumer uses CDP and frames route by session', async()=>{
  const f=fixture();const releaseHAR=f.connection.acquire();const releaseAction=f.connection.acquire();
  releaseAction();assert.equal(f.dbg.isAttached(),true);
  f.dbg.emit('message',{},'Target.attachedToTarget',{sessionId:'child-session',targetInfo:{type:'iframe',targetId:'child'}});
  const frames=await f.connection.frames();
  assert.equal(frames.find(frame=>frame.id==='child').sessionId,'child-session');
  await f.connection.send('DOM.getDocument',{},'child-session');
  assert.deepEqual(f.calls.at(-1),['DOM.getDocument','child-session']);
  releaseHAR();
  f.wc.emit('destroyed');assert.equal(f.dbg.listenerCount('message'),0);
});
test('references reject other tabs, removed nodes and document replacements', async()=>{
  const f=fixture();await f.connection.frames();
  const refs=new ElementReferences(f.connection,1);
  const ref=refs.add('root',7);
  assert.equal((await refs.resolve(ref)).backendNodeId,7);
  await assert.rejects(new ElementReferences(f.connection,2).resolve(ref),/stale_ref/);
  f.remove();await assert.rejects(refs.resolve(ref),/stale_ref/);
  const newer=refs.add('root',8);
  f.dbg.emit('message',{},'Page.frameNavigated',{frame:{id:'root',url:'https://next/'}});
  await assert.rejects(refs.resolve(newer),/stale_ref/);
  f.wc.emit('destroyed');
});
test('frame completion clears a document whose loadingFinished event stayed in the previous target',()=>{
  const f=fixture();
  f.dbg.emit('message',{},'Network.requestWillBeSent',{requestId:'old-document',frameId:'switched',type:'Document'});
  f.dbg.emit('message',{},'Page.frameStoppedLoading',{frameId:'switched'},'new-session');
  assert.equal(f.connection.inflight.size,0);f.wc.emit('destroyed');
});
test('a document request changing target session cannot remain pending forever',()=>{
  const f=fixture();
  f.dbg.emit('message',{},'Network.requestWillBeSent',{requestId:'doc',frameId:'child',type:'Document',request:{url:'https://child/'}});
  f.dbg.emit('message',{},'Network.responseReceived',{requestId:'doc',frameId:'child',type:'Document',response:{mimeType:'text/html'}},'child-session');
  f.dbg.emit('message',{},'Network.loadingFinished',{requestId:'doc'},'child-session');
  assert.equal(f.connection.inflight.size,0);
  f.wc.emit('destroyed');
});
test('root response and child loadingFinished complete the same document request',()=>{
  const f=fixture();
  f.dbg.emit('message',{},'Network.requestWillBeSent',{requestId:'loader',frameId:'child',type:'Document'});
  f.dbg.emit('message',{},'Network.responseReceived',{requestId:'loader',frameId:'child',type:'Document',response:{mimeType:'text/html'}});
  f.dbg.emit('message',{},'Network.loadingFinished',{requestId:'loader'},'child-session');
  assert.equal(f.connection.inflight.size,0);f.wc.emit('destroyed');
});
test('reference retention evicts old IDs and closed tabs invalidate the latest ID',async()=>{
  const f=fixture();await f.connection.frames();const refs=new ElementReferences(f.connection,1);
  const first=refs.add('root',1);let latest;
  for(let i=0;i<2000;i++)latest=refs.add('root',i+2);
  await assert.rejects(refs.resolve(first),/stale_ref/);
  assert.equal((await refs.resolve(latest)).backendNodeId,2001);
  f.wc.emit('destroyed');await assert.rejects(refs.resolve(latest),/stale_ref/);
});
test('WebSocket and streaming responses do not remain in HTTP idle tracking',()=>{
  const f=fixture();
  f.dbg.emit('message',{},'Network.requestWillBeSent',{requestId:'ws',type:'WebSocket'});
  f.dbg.emit('message',{},'Network.requestWillBeSent',{requestId:'sse',type:'EventSource'});
  f.dbg.emit('message',{},'Network.responseReceived',{requestId:'sse',response:{mimeType:'text/event-stream'}});
  assert.equal(f.connection.inflight.size,0);f.wc.emit('destroyed');
});
test('destroyed WebContents are not dereferenced while cleaning debugger listeners',()=>{
  const wc=new EventEmitter(),dbg=new EventEmitter();let destroyed=false;
  wc.isDestroyed=()=>destroyed;
  Object.defineProperty(wc,'debugger',{get(){if(destroyed)throw new Error('Object has been destroyed');return dbg;}});
  new PageConnection(wc);destroyed=true;
  assert.doesNotThrow(()=>wc.emit('destroyed'));assert.equal(dbg.listenerCount('message'),0);
});
