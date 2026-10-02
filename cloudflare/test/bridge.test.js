import test from 'node:test';import assert from 'node:assert/strict';
import {runCommand,readCommand,materializeResult} from '../src/bridge.js';
function envWith(handler){return {CONTROL_TOKEN:'secret',CONTROL:{fetch:handler}};}
test('commands use only hardfire and preserve MCP content',async()=>{
 const calls=[];const result={isError:true,content:[{type:'text',text:'stale_ref'}]};
 const env=envWith(async request=>{calls.push(request);const url=new URL(request.url);if(url.pathname==='/api/state')return Response.json({state:{connected:true,last_seen:Date.now()}});return Response.json({status:'done',result});});
 assert.deepEqual(await runCommand(env,'hardfire_click_ref',{ref:'x'}),result);
 assert.equal(new URL(calls[0].url).searchParams.get('agent_id'),'hardfire');const sent=await calls[1].json();assert.equal(sent.agent_id,'hardfire');assert.equal(sent.action,'hardfire_click_ref');
});
test('running command returns query ID and never resubmits uncertain actions',async()=>{
 let rpc=0;const env=envWith(async request=>{const url=new URL(request.url);if(url.pathname==='/api/state')return Response.json({state:{connected:true,last_seen:Date.now()}});if(url.pathname==='/api/rpc'){rpc++;return Response.json({id:'a',status:'running'});}return Response.json({command:{id:'a',agent_id:'hardfire',status:'running'}});});
 const first=await runCommand(env,'hardfire_wait_for',{});assert.match(first.content[0].text,/running/);await readCommand(env,'a');assert.equal(rpc,1);
});
test('rejects foreign IDs and finished result wins over late started',async()=>{
 const env=envWith(async()=>Response.json({command:{id:'a',agent_id:'firetrace',status:'done',result:{content:[]}}}));await assert.rejects(readCommand(env,'a'),/not found/);
 env.CONTROL.fetch=async()=>Response.json({command:{id:'a',agent_id:'hardfire',status:'running',finished_at:123,result:{content:[]}}});assert.equal((await readCommand(env,'a')).status,'done');
});
test('screenshot lookup uses exact order and rejects another agent image',async()=>{
 const ids=[];const env={DB:{prepare:()=>({bind:(agent,id)=>{ids.push([agent,id]);return {first:async()=>({payload_json:JSON.stringify({key:'screenshots/firetrace/wrong.jpg'})})};}})},SCREENSHOTS:{get:async()=>{throw new Error('must not read foreign bucket object');}}};
 await assert.rejects(materializeResult(env,{content:[{type:'image',mimeType:'image/jpeg',_hardfire_image_id:'a:image:0'}]},'a'),/Invalid screenshot/);assert.deepEqual(ids,[['hardfire','a:image:0']]);
});
