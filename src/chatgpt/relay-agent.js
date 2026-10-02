'use strict';
const {decodeMessage,encodeScreenshot,validId}=require('./control-protocol');
const reconnectDelay=(attempt,random=Math.random)=>Math.min(30000,1000*2**Math.min(attempt,5)*(1+random()*0.25));
function createRelayAgent({client,config,socketFactory,clock=Date.now,random=Math.random,log=()=>{},limits={}}){
  const maxBacklog=limits.backlog??18*1024*1024,maxSeen=limits.seen??2048;
  let socket,timer,heartbeat,lastPong=0,stopped=true,attempt=0,tools=[],chain=Promise.resolve(),bytes=0;
  const seen=new Map(),pending=new Map();
  function send(data){if(socket?.readyState===1)socket.send(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
  function replay(record){for(const frame of record.images)send(frame);send(record.json);}
  function state(){return {agent_id:'hardfire',connected:socket?.readyState===1,tools_available:tools.length,pending_results:pending.size};}
  async function connected(next){
    if(stopped)return;socket=next;attempt=0;clearInterval(heartbeat);
    send({type:'hello',agent_id:'hardfire',ts:clock()/1000,version:'1.5.1',transport:'cloudflare-wss-sync',backend:'hardfire-mcp'});
    send({type:'state',agent_id:'hardfire',ts:clock()/1000,state:{capabilities:tools.map(x=>x.name),plugin_version:'1.5.1',tools_available:tools.length}});
    for(const record of pending.values())replay(record);
    lastPong=clock();
    heartbeat=setInterval(()=>{if(clock()-lastPong>(limits.heartbeatTimeout??90000)){log('Relay heartbeat expired');if(next.terminate)next.terminate();else next.close();return;}send('firetrace:ping');},limits.heartbeatInterval??30000);heartbeat.unref?.();
  }
  function open(){
    if(stopped)return;
    const url=new URL(config.url);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.searchParams.set('agent_id','hardfire');
    const next=socketFactory(url.toString(),{headers:{'X-Control-Token':config.token,'X-Firetrace-Protocol':'2'},maxPayload:16*1024*1024,handshakeTimeout:15000,followRedirects:false,perMessageDeflate:false});
    socket=next;
    next.on('open',()=>connected(next).catch(()=>log('Connection initialization failed')));
    next.on('message',(raw,binary)=>{if(socket!==next)return;if(!binary){if(String(raw)==='firetrace:pong'){lastPong=clock();return;}const data=decodeMessage(raw);if(data)void handle(data).catch(()=>log('Invalid relay message'));}});
    next.on('error',()=>{log('Relay connection failed');next.close();});
    next.on('close',()=>{if(stopped||socket!==next)return;clearInterval(heartbeat);timer=setTimeout(open,reconnectDelay(attempt++,random));timer.unref?.();});
  }
  async function execute(command){
    if(stopped||bytes>=maxBacklog){
      seen.set(command.id,'refused');send({type:'result',id:command.id,ok:false,error:'backlog_full; command not executed',finished_at:clock()/1000});return;
    }
    const started=clock()/1000;
    send({type:'started',id:command.id,action:command.action,started_at:started});
    let result,images=[];
    try{
      result=await client.callTool(command.action,command.args||{});
      if(!Array.isArray(result?.content))throw new Error('Invalid MCP result');
      result={...result,content:result.content.map((block,index)=>{
        if(block.type!=='image')return block;
        const imageId=command.id+':image:'+index;
        images.push(encodeScreenshot(imageId,Buffer.from(block.data,'base64'),block.mimeType));
        return {type:'image',mimeType:block.mimeType,_hardfire_image_id:imageId};
      })};
    }catch{result={isError:true,content:[{type:'text',text:'Local MCP command failed; effect may have occurred. Inspect state before retrying.'}]};images=[];}
    let json=JSON.stringify({type:'result',id:command.id,action:command.action,ok:true,result,started_at:started,finished_at:clock()/1000});
    const imageBytes=images.reduce((n,frame)=>n+frame.length,0);
    if(Buffer.byteLength(json)>1500000||bytes+imageBytes+Buffer.byteLength(json)>maxBacklog){
      images=[];json=JSON.stringify({type:'result',id:command.id,action:command.action,ok:true,result:{isError:true,content:[{type:'text',text:'result_too_large; action may have occurred. Inspect state before retrying.'}]},started_at:started,finished_at:clock()/1000});
    }
    const record={json,images,size:Buffer.byteLength(json)+images.reduce((n,frame)=>n+frame.length,0)};
    pending.set(command.id,record);bytes+=record.size;seen.set(command.id,'finished');replay(record);
  }
  async function handle(data){
    if(stopped)return;
    if(data.type==='result_ack'&&validId(data.id)){const record=pending.get(data.id);if(record){bytes-=record.size;pending.delete(data.id);}return;}
    if(data.type!=='command')return;
    const command=data.command;
    if(!command||!validId(command.id)||(command.agent_id&&command.agent_id!=='hardfire')||!tools.some(x=>x.name===command.action)||!command.args||typeof command.args!=='object'||Array.isArray(command.args))return;
    if(seen.has(command.id)){const record=pending.get(command.id);if(record)replay(record);else if(seen.get(command.id)==='refused')send({type:'result',id:command.id,ok:false,error:'backlog_full; command not executed',finished_at:clock()/1000});return chain;}
    if(bytes>=maxBacklog||seen.size>=maxSeen&&!Array.from(seen.keys()).some(id=>!pending.has(id)&&['finished','refused'].includes(seen.get(id)))){
      send({type:'result',id:command.id,ok:false,error:'backlog_full; command not executed',finished_at:clock()/1000});return;
    }
    while(seen.size>=maxSeen){const id=Array.from(seen.keys()).find(key=>!pending.has(key)&&['finished','refused'].includes(seen.get(key)));if(id===undefined)break;seen.delete(id);}
    seen.set(command.id,'queued');
    chain=chain.then(()=>execute(command));return chain;
  }
  return {state,handle,connected,
    async start(){if(!stopped)return;const url=new URL(config.url);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Secure control URL required');if(!config.token)throw new Error('Control token not configured');await client.connect();tools=await client.listTools();stopped=false;open();},
    async stop(){stopped=true;clearTimeout(timer);clearInterval(heartbeat);socket?.close();await chain;await client.close();}
  };
}
module.exports={createRelayAgent,reconnectDelay};
