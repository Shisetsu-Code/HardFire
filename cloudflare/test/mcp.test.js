import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {handleMcp} from '../src/mcp.js';
async function rpc(method,params={}){const response=await handleMcp(new Request('https://hardfire.example/mcp',{method:'POST',headers:{accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{});return response.json();}
test('remote browser catalog is identical to local; only adds result query',async()=>{
 const local=JSON.parse(fs.readFileSync(new URL('../../plugin/HardFire/mcp/tools.json',import.meta.url)));
 const {result}=await rpc('tools/list');assert.equal(result.tools.length,26);assert.deepEqual(result.tools.filter(x=>x.name!=='hardfire_command_result').map(({_meta,...tool})=>tool),local);
});
test('initialization describes local browser and deferred commands',async()=>{
 const {result}=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.match(result.instructions,/hardfire_command_result/);assert.match(result.instructions,/local/);
});
test('unknown tool never reaches control service',async()=>{const result=await rpc('tools/call',{name:'shell',arguments:{}});assert.ok(result.error);});
