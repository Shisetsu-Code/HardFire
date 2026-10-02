'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {waitFor}=require('../src/browser-waits');
function fixture(value){const listeners=new Set();return {connection:{closed:false,inflight:new Map(),lastNetworkChange:Date.now(),send:async()=>({result:{value}}),subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}},listeners};}
test('wait validates bounds, reports timeout and removes subscriptions',async()=>{
  const f=fixture(false);
  for(const timeout_ms of [0,60001,null])await assert.rejects(waitFor(f.connection,{condition:{type:'css',value:'#late'},timeout_ms}));
  await assert.rejects(waitFor(f.connection,{condition:{type:'css',value:'#late'},timeout_ms:15}),error=>error.code==='timeout');
  assert.equal(f.listeners.size,0);
});
test('wait returns an observed match and cancellation cleans up',async()=>{
  const yes=fixture(true);assert.equal((await waitFor(yes.connection,{condition:{type:'text',value:'ready'}})).matched,true);
  const no=fixture(false),abort=new AbortController();
  const pending=waitFor(no.connection,{condition:{type:'url',value:'later'},signal:abort.signal});
  abort.abort();await assert.rejects(pending);assert.equal(no.listeners.size,0);
});
test('navigation cancels a wait rather than observing another document',async()=>{
  const f=fixture(false);const pending=waitFor(f.connection,{condition:{type:'text',value:'never'}});
  for(const listener of f.listeners)listener('Page.frameNavigated',{frame:{id:'root'}});
  await assert.rejects(pending,/navigation/);assert.equal(f.listeners.size,0);
});
test('periodic HTTP activity prevents idle and a closed tab cancels promptly',async()=>{
  const f=fixture(false);const pulse=setInterval(()=>{f.connection.lastNetworkChange=Date.now();},5);
  try{await assert.rejects(waitFor(f.connection,{condition:{type:'network_idle'},idle_ms:20,timeout_ms:40}),e=>e.code==='timeout');}
  finally{clearInterval(pulse);}
  const pending=waitFor(f.connection,{condition:{type:'text',value:'never'}});
  for(const listener of f.listeners)listener('HardFire.closed',{});
  await assert.rejects(pending,/closed/);assert.equal(f.listeners.size,0);
});
