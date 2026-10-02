'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createLocalClient}=require('../src/chatgpt/local-client');
function fixture(result){
  const calls=[];
  const sdk={connect:async()=>{},listTools:async()=>({tools:[{name:'hardfire_status'}]}),callTool:async(...args)=>{calls.push(args);return result;},close:async()=>{}};
  return {client:createLocalClient({clientFactory:()=>sdk,transportFactory:()=>({})}),calls,sdk};
}
test('preserves text, images and tool errors without wrapping',async()=>{
  for(const result of [{content:[{type:'text',text:'{"connected":true}'}]},{isError:true,content:[{type:'text',text:'stale_ref'}]},{content:[{type:'image',mimeType:'image/jpeg',data:'AA=='}]}]){
    const {client}=fixture(result);await client.connect();assert.deepEqual(await client.callTool('hardfire_status',{}),result);await client.close();
  }
});
test('a closed transport reconnects only for subsequent requests',async()=>{
 const instances=[];let calls=0;
 const client=createLocalClient({transportFactory:()=>({}),clientFactory:()=>{const sdk={connect:async()=>{},listTools:async()=>({tools:[{name:'hardfire_status'}]}),callTool:async()=>{calls++;if(instances.length===1){sdk.onclose();throw new Error('disconnected');}return {content:[]};},close:async()=>{}};instances.push(sdk);return sdk;}});
 await assert.rejects(client.callTool('hardfire_status',{}),/disconnected/);
 assert.equal(calls,1);await client.callTool('hardfire_status',{});assert.equal(instances.length,2);assert.equal(calls,2);await client.close();
});
test('unknown tools never reach the browser and discovery is shared',async()=>{
  const {client,calls}=fixture({content:[]});await Promise.all([client.connect(),client.connect()]);
  await assert.rejects(client.callTool('shell',{}),/Unknown HardFire tool/);assert.equal(calls.length,0);
  assert.equal((await client.listTools()).length,1);await client.close();
});
test('forwards cancellation and rejects use after closing',async()=>{
  const {client,calls}=fixture({content:[]});await client.connect();const signal=new AbortController().signal;
  await client.callTool('hardfire_status',{tab_id:7},{signal});assert.equal(calls[0][2].signal,signal);
  await client.close();await assert.rejects(client.callTool('hardfire_status',{}),/closed/);
});
