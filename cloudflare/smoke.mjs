import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {verifyOAuth} from './oauth-verification.mjs';
const base=process.env.MCP_URL||'https://hardfire-mcp.braian-n-l.workers.dev';
const {MCP_PASSWORD}=JSON.parse(await fs.readFile(new URL('./secrets.json',import.meta.url),'utf8'));
let count=0;
await verifyOAuth({base,request:fetch,password:MCP_PASSWORD,onToken:async token=>{
 const rpc=async(method,params={})=>{const response=await fetch(base+'/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++count,method,params})});assert.equal(response.status,200);const envelope=await response.json();assert.ok(!envelope.error,JSON.stringify(envelope));return envelope.result;};
 const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'HardFire verification',version:'1'}});assert.equal(init.serverInfo.name,'HardFire');
 assert.equal((await rpc('tools/list')).tools.length,26);
 const call=async(name,args={})=>{let result=await rpc('tools/call',{name,arguments:args});for(let attempt=0;attempt<30;attempt++){
   const first=result.content?.find(item=>item.type==='text');let parsed;try{parsed=JSON.parse(first?.text);}catch{}
   if(!parsed?.command_id||!['running','pending','sent','queued','unknown'].includes(parsed.status))break;
   await new Promise(resolve=>setTimeout(resolve,1000));result=await rpc('tools/call',{name:'hardfire_command_result',arguments:{command_id:parsed.command_id}});
 }assert.notEqual(result.isError,true,JSON.stringify(result));return result;};
 const result=await call('hardfire_status');const state=JSON.parse(result.content[0].text);assert.equal(state.connected,true);
 console.log(JSON.stringify({oauth:true,tools:26,connected:true,visible:state.visible,tab_id:state.tab_id}));
 if(process.env.HARDFIRE_SMOKE_SCREENSHOT==='1'){
   const shot=await call('hardfire_screenshot',{tab_id:state.tab_id});const image=shot.content.find(item=>item.type==='image');assert.equal(image?.mimeType,'image/jpeg');const bytes=Buffer.from(image.data,'base64');assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.ok(bytes.length>1000);
   if(process.env.HARDFIRE_SMOKE_IMAGE_PATH)await fs.writeFile(process.env.HARDFIRE_SMOKE_IMAGE_PATH,bytes);
   console.log(JSON.stringify({screenshot:true,JPEG_bytes:bytes.length}));
 }
}});
console.log('PASS production OAuth, catalog, browser and grant revocation');
