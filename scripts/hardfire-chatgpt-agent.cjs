'use strict';
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const net=require('node:net');
const {createLocalClient}=require('../src/chatgpt/local-client');
const {createRelayAgent}=require('../src/chatgpt/relay-agent');
const WebSocket=require('ws');
const lockPath=process.env.HARDFIRE_AGENT_LOCK||path.join(os.homedir(),'.hardfire','chatgpt-agent.lock');
fs.mkdirSync(path.dirname(lockPath),{recursive:true});
let ownership,agent,owned=false;
async function lock(){
  // OS-owned exclusive socket prevents stale-file races and releases on process death.
  ownership=net.createServer(socket=>socket.destroy());
  await new Promise((resolve,reject)=>{ownership.once('error',reject);ownership.listen({host:'127.0.0.1',port:18766,exclusive:true},resolve);});
  owned=true;fs.writeFileSync(lockPath,String(process.pid));
}
function unlock(){if(!owned)return;try{if(fs.readFileSync(lockPath,'utf8')===String(process.pid))fs.unlinkSync(lockPath);}catch{}ownership?.close();owned=false;}
async function stop(){await agent?.stop();unlock();process.exit(0);}
process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('exit',unlock);
(async()=>{await lock();agent=createRelayAgent({client:createLocalClient(),socketFactory:(url,options)=>new WebSocket(url,options),config:{url:process.env.HARDFIRE_CONTROL_URL||process.env.CF_CONTROL_URL,token:process.env.HARDFIRE_CONTROL_TOKEN||process.env.CF_CONTROL_TOKEN},log:message=>console.error(new Date().toISOString(),message)});await agent.start();console.error('HardFire ChatGPT agent started');})().catch(()=>{console.error('HardFire agent startup failed; check configuration, dependencies and agent lock');unlock();process.exit(1);});
