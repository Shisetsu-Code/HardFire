import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp } from '../src/mcp.js';

const request=(method,params={},id=1)=>new Request('https://example.com/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});

test('MCP initializes and advertises the callable HardFire tool set',async()=>{
  const init=await (await handleMcp(request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}),{})).json();
  assert.equal(init.result.serverInfo.name,'HardFire');
  const result=await (await handleMcp(request('tools/list'),{})).json();
  const names=result.result.tools.map(tool=>tool.name);
  assert.equal(names.length,13);
  for(const name of [
    'hardfire_status','hardfire_open','hardfire_click','hardfire_click_relative',
    'hardfire_wait','hardfire_screenshot','hardfire_network_events','hardfire_network_clear',
    'hardfire_record_start','hardfire_record_save','hardfire_trigger_and_capture',
    'hardfire_sequence','hardfire_command_result'
  ]) assert.ok(names.includes(name),name);
  assert.equal(result.result.tools.find(t=>t.name==='hardfire_click').annotations.readOnlyHint,false);
  assert.equal(result.result.tools.find(t=>t.name==='hardfire_screenshot').annotations.readOnlyHint,true);
});

test('invalid URLs are rejected before reaching the control service',async()=>{
  const response=await handleMcp(request('tools/call',{name:'hardfire_open',arguments:{url:'file:///secret'}}),{});
  const result=await response.json();
  assert.equal(result.result.isError,true);
});

test('offline agent returns a tool error rather than false success',async()=>{
  const env={CONTROL_TOKEN:'secret',CONTROL:{fetch:async()=>Response.json({ok:true,state:{connected:false}})}};
  const result=await (await handleMcp(request('tools/call',{name:'hardfire_click',arguments:{x:1,y:2}}),env)).json();
  assert.equal(result.result.isError,true);
  assert.match(result.result.content[0].text,/not connected/);
});
