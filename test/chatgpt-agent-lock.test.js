'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');const {WebSocketServer}=require('ws');
test('actual agent refuses a second process and recovers a stale own lock',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hardfire-lock-test-')),lock=path.join(root,'agent.lock');
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve));
 const children=[];
 const start=()=>{const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/hardfire-chatgpt-agent.cjs')],{windowsHide:true,env:{...process.env,HARDFIRE_AGENT_LOCK:lock,HARDFIRE_CONTROL_URL:'http://127.0.0.1:'+server.address().port,HARDFIRE_CONTROL_TOKEN:'test-lock-token'},stdio:['ignore','ignore','pipe']});children.push(child);return child;};
 const connected=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('agent did not connect')),10000);server.once('connection',socket=>socket.on('message',raw=>{if(String(raw).includes('"type":"state"')){clearTimeout(timer);resolve();}}));});
 try{
   const ready=connected(),first=start();await ready;assert.equal(Number(await fs.readFile(lock,'utf8')),first.pid);
   const second=start();let errors='';second.stderr.on('data',chunk=>errors+=chunk);const code=await new Promise(resolve=>second.once('exit',resolve));assert.equal(code,1);assert.ok(!errors.includes('test-lock-token'));assert.equal(Number(await fs.readFile(lock,'utf8')),first.pid);
   const exited=new Promise(resolve=>first.once('exit',resolve));first.kill();await exited;
   // Simulate an abrupt exit that left its lock. The dead PID is verified first.
   await fs.writeFile(lock,String(first.pid));const recovered=connected(),third=start();await recovered;assert.equal(Number(await fs.readFile(lock,'utf8')),third.pid);
 }finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
});
