'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {WebSocketServer,WebSocket}=require('ws');
const {createRelayAgent}=require('../src/chatgpt/relay-agent');
test('real WebSocket authenticates headers, executes once and uploads correlated JPEG',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve));
 let count=0;const messages=[],frames=[];let connection;
 const agent=createRelayAgent({client:{connect:async()=>{},close:async()=>{},listTools:async()=>[{name:'hardfire_screenshot'}],callTool:async()=>{count++;return {content:[{type:'image',mimeType:'image/jpeg',data:Buffer.from([255,216,1,255,217]).toString('base64')}]};}},socketFactory:(url,options)=>new WebSocket(url,options),config:{url:'http://127.0.0.1:'+server.address().port,token:'wire-secret'}});
 try{
   const ready=new Promise(resolve=>server.on('connection',(socket,req)=>{connection=socket;assert.equal(req.headers['x-control-token'],'wire-secret');assert.equal(new URL(req.url,'http://localhost').searchParams.get('agent_id'),'hardfire');socket.on('message',(bytes,binary)=>{if(binary)frames.push(bytes);else {const data=JSON.parse(bytes);messages.push(data);if(data.type==='state')resolve();}});}));
   await agent.start();await ready;
   const command={id:'wire-1',action:'hardfire_screenshot',args:{}};
   connection.send(JSON.stringify({type:'command',command}));connection.send(JSON.stringify({type:'command',command}));
   const deadline=Date.now()+5000;while(!messages.some(x=>x.type==='result')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(count,1);assert.ok(frames.length>=1);const frame=frames[0],length=frame.readUInt32BE(0),header=JSON.parse(frame.subarray(4,4+length));
   assert.equal(header.command_id,'wire-1:image:0');assert.equal(messages.find(x=>x.type==='result').result.content[0]._hardfire_image_id,header.command_id);
   connection.send(JSON.stringify({type:'result_ack',id:'wire-1'}));
 }finally{await agent.stop();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
});
