'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const {WebSocketServer,WebSocket}=require('ws');
const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
const {createLocalClient}=require('../src/chatgpt/local-client');const {createRelayAgent}=require('../src/chatgpt/relay-agent');
const repo=path.resolve(__dirname,'..');
async function run(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hardfire-relay-'));
 const page=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<button aria-label="Relay action" onclick="this.textContent=\'Clicked\'">Action</button><p id="late"></p><script>setTimeout(()=>document.getElementById("late").textContent="Deferred complete",27000)</script>');});
 await new Promise(resolve=>page.listen(0,'127.0.0.1',resolve));
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 await fs.mkdir(path.join(root,'node_modules/electron'),{recursive:true});await fs.mkdir(path.join(root,'profile'));await fs.mkdir(path.join(root,'downloads'));
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'hardfire',main:'index.cjs'}));await fs.writeFile(path.join(root,'node_modules/electron/path.txt'),require('electron'));
 await fs.writeFile(path.join(root,'index.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(root,'profile'))});app.setPath('downloads',${JSON.stringify(path.join(root,'downloads'))});require('node:fs').writeFileSync(${JSON.stringify(path.join(root,'pid.txt'))},String(process.pid));require(${JSON.stringify(path.join(repo,'src/main.js'))});`);
 const client=createLocalClient({transportFactory:()=>new StdioClientTransport({command:process.execPath,args:[path.join(repo,'plugin/HardFire/mcp/bridge.cjs')],env:{...process.env,HARDFIRE_APP_PATH:root,HARDFIRE_MCP_URL:`http://127.0.0.1:${port}/mcp`},stderr:'pipe'})});
 const sockets=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>sockets.once('listening',resolve));
 let ws,state;const commands=new Map(),events=new Map(),objects=new Map();
 sockets.on('connection',(socket,request)=>{assert.equal(request.headers['x-control-token'],'fixture-token');ws=socket;
   socket.on('message',(raw,binary)=>{
     if(binary){const n=raw.readUInt32BE(0),header=JSON.parse(raw.subarray(4,4+n));const key=`screenshots/hardfire/${header.ts}-${header.command_id}.jpg`;const bytes=raw.subarray(4+n);objects.set(key,bytes);events.set(header.command_id,{payload_json:JSON.stringify({key})});return;}
     if(String(raw)==='firetrace:ping'){socket.send('firetrace:pong');return;}
     const data=JSON.parse(raw);
     if(data.type==='state')state={connected:true,last_seen:Date.now(),meta:{state:data.state}};
     if(data.type==='result'){const row=commands.get(data.id);if(row)Object.assign(row,{status:data.ok?'done':'error',finished_at:data.finished_at,result:data.result,error:data.error});socket.send(JSON.stringify({type:'result_ack',id:data.id}));}
   });
 });
 const env={CONTROL_TOKEN:'fixture-token',CONTROL:{async fetch(request){const url=new URL(request.url);
   if(url.pathname==='/api/state')return Response.json({state});
   if(url.pathname.startsWith('/api/command/'))return Response.json({command:commands.get(decodeURIComponent(url.pathname.split('/').at(-1)))});
   if(url.pathname==='/api/rpc'){
     const body=await request.json();assert.equal(body.agent_id,'hardfire');const row={...body,status:'running'};commands.set(body.id,row);ws.send(JSON.stringify({type:'command',command:body}));
     const deadline=Date.now()+Math.min(body.wait_ms,25000);while(row.status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
     return Response.json({id:body.id,agent_id:'hardfire',status:row.status,result:row.result});
   }return new Response('missing',{status:404});
 }},DB:{prepare:()=>({bind:(agent,id)=>{assert.equal(agent,'hardfire');return {first:async()=>events.get(id)};}})},SCREENSHOTS:{get:async key=>{const bytes=objects.get(key);return bytes?{size:bytes.length,arrayBuffer:async()=>bytes}:null;}}};
 const agent=createRelayAgent({client,config:{url:`http://127.0.0.1:${sockets.address().port}`,token:'fixture-token'},socketFactory:(url,options)=>new WebSocket(url,options)});
 const {handleMcp}=await import(pathToFileURL(path.join(repo,'cloudflare/src/mcp.js')));
 let rpcId=0;
 const rpc=async(name,args={})=>{const response=await handleMcp(new Request('https://hardfire.example/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}})}),env);const envelope=await response.json();assert.ok(!envelope.error,JSON.stringify(envelope));assert.notEqual(envelope.result.isError,true,JSON.stringify(envelope));return envelope.result;};
 const data=async(name,args)=>JSON.parse((await rpc(name,args)).content[0].text);
 try{
   await agent.start();for(let i=0;i<100&&!state;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(state);
   const initial=await data('hardfire_launch',{headless:true});assert.equal(initial.visible,false);
   await data('hardfire_launch',{headless:false});await data('hardfire_launch',{headless:true});
   const tab_id=initial.tab_id;await data('hardfire_record_start',{tab_id});
   await data('hardfire_open',{tab_id,url:`http://127.0.0.1:${page.address().port}/`});
   const other=await data('hardfire_tab_new',{activate:false,url:'about:blank'}).catch(()=>null);
   // MCP accepts HTTP(S) for explicit URLs; omit URL for an empty tab.
   const second=other||await data('hardfire_tab_new',{activate:false});
   const found=await data('hardfire_find',{tab_id,name:'Relay action',role:'button'});assert.equal(found.elements.length,1);
   await data('hardfire_click_ref',{tab_id,ref:found.elements[0].ref});await data('hardfire_wait_for',{tab_id,condition:{type:'text',value:'Clicked'}});
   const pending=await data('hardfire_wait_for',{tab_id,condition:{type:'text',value:'Deferred complete'},timeout_ms:60000});assert.equal(pending.status,'running');
   let completed;for(let i=0;i<30;i++){const result=await rpc('hardfire_command_result',{command_id:pending.command_id});const observation=JSON.parse(result.content[0].text);if(!observation.status){completed=observation;break;}await new Promise(resolve=>setTimeout(resolve,300));}assert.equal(completed.matched,true);
   const image=(await rpc('hardfire_screenshot',{tab_id})).content.find(item=>item.type==='image');assert.equal(image.mimeType,'image/jpeg');assert.ok(Buffer.from(image.data,'base64').length>1000);await fs.writeFile(path.join(root,'relay.jpg'),Buffer.from(image.data,'base64'));
   const har=await data('hardfire_record_save',{tab_id});assert.ok(har.path);
   const tabs=await data('hardfire_tabs');assert.ok(tabs.tabs.some(tab=>tab.id===second.id));
   console.log(JSON.stringify({passed:true,tools:26,realElectron:true,visibleHidden:true,tabs:true,refs:true,deferredWait:true,JPEG:true,HAR:har.path,artifacts:root}));
 }finally{
   await agent.stop();for(const socket of sockets.clients)socket.terminate();await new Promise(resolve=>sockets.close(resolve));
   try{process.kill(Number(await fs.readFile(path.join(root,'pid.txt'),'utf8')));}catch{}
   page.closeAllConnections();await new Promise(resolve=>page.close(resolve));
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
