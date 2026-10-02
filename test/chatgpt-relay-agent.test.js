'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createRelayAgent,reconnectDelay}=require('../src/chatgpt/relay-agent');
const {decodeMessage,encodeScreenshot}=require('../src/chatgpt/control-protocol');
class Socket extends EventEmitter{readyState=1;sent=[];send(data){this.sent.push(data);}close(){this.readyState=3;this.emit('close');}}
function fixture(options={}){const sockets=[],calls=[];const client={connect:async()=>{},listTools:async()=>[{name:'hardfire_click'}],callTool:async(name,args)=>{calls.push({name,args});return {content:[{type:'text',text:'done'}]};},close:async()=>{}};
 const agent=createRelayAgent({client,config:{url:'https://control.example',token:'SECRET'},socketFactory:()=>{const socket=new Socket();sockets.push(socket);return socket;},...options});return {agent,sockets,calls};}
const command={id:'c-1',action:'hardfire_click',args:{x:2,y:3},agent_id:'hardfire'};
test('duplicates before and after ACK never repeat actions',async()=>{
 const {agent,sockets,calls}=fixture();await agent.start();sockets[0].emit('open');
 await Promise.all([agent.handle({type:'command',command}),agent.handle({type:'command',command})]);assert.equal(calls.length,1);
 await agent.handle({type:'result_ack',id:'c-1'});await agent.handle({type:'command',command});assert.equal(calls.length,1);await agent.stop();
});
test('missing heartbeat responses close a silent socket',async()=>{
 let now=0;const {agent,sockets}=fixture({clock:()=>now,limits:{heartbeatInterval:10,heartbeatTimeout:20}});
 await agent.start();sockets[0].emit('open');now=100;await new Promise(resolve=>setTimeout(resolve,35));
 assert.equal(sockets[0].readyState,3);await agent.stop();
});
test('pending results replay on connection recovery without replaying input',async()=>{
 const {agent,sockets,calls}=fixture();await agent.start();sockets[0].emit('open');await agent.handle({type:'command',command});
 const next=new Socket();await agent.connected(next);assert.ok(next.sent.some(x=>typeof x==='string'&&JSON.parse(x).type==='result'));assert.equal(calls.length,1);await agent.stop();
});
test('invalid or foreign commands never execute; backlog refuses effects',async()=>{
 const {agent,calls}=fixture({limits:{backlog:1}});await agent.start();
 await agent.handle({type:'command',command:{...command,agent_id:'firetrace'}});await agent.handle({type:'command',command:{...command,id:'../bad'}});assert.equal(calls.length,0);
 await agent.handle({type:'command',command});await agent.handle({type:'command',command:{...command,id:'c-2'}});assert.equal(calls.length,1);await agent.stop();
});
test('protocol rejects malformed input and binds binary screenshot to order',()=>{
 assert.equal(decodeMessage('{bad'),null);assert.equal(decodeMessage('[]'),null);
 const frame=encodeScreenshot('c-1',Buffer.from([1,2]),'image/jpeg');const size=frame.readUInt32BE(0);const header=JSON.parse(frame.subarray(4,4+size));assert.equal(header.agent_id,'hardfire');assert.equal(header.command_id,'c-1');assert.deepEqual(frame.subarray(4+size),Buffer.from([1,2]));
 assert.ok(reconnectDelay(20,()=>1)<=30000);assert.ok(reconnectDelay(0,()=>0)>=1000);
});
test('queued commands recheck backlog before effects',async()=>{
 const {agent,calls}=fixture({limits:{backlog:1}});await agent.start();
 await Promise.all([agent.handle({type:'command',command}),agent.handle({type:'command',command:{...command,id:'c-2'}})]);
 assert.equal(calls.length,1);await agent.stop();
});
