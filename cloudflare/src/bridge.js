const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id);
export async function controlRequest(env,path,body){
  if(!env.CONTROL_TOKEN)throw new Error('Control service is not configured');
  const response=await env.CONTROL.fetch(new Request('https://control.internal'+path,{method:body?'POST':'GET',headers:{'x-control-token':env.CONTROL_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(28000)}));
  if(!response.ok)throw new Error('Control service returned HTTP '+response.status);
  return response.json();
}
export async function readState(env){return controlRequest(env,'/api/state?agent_id=hardfire');}
export async function readCommand(env,id){
  if(!validId(id))throw new Error('Invalid command ID');
  const {command}=await controlRequest(env,'/api/command/'+encodeURIComponent(id));
  if(command?.agent_id!=='hardfire'||command.id!==id)throw new Error('Command not found');
  if(Number.isFinite(command.finished_at)&&['running','sent','queued','pending'].includes(command.status)){
    command.status=command.error?'error':command.result!==null&&command.result!==undefined?'done':'unknown';
  }
  return command;
}
async function imageForCommand(env,imageId){
  for(let attempt=0;attempt<20;attempt++){
    const row=await env.DB.prepare("SELECT payload_json FROM events WHERE agent_id = ? AND command_id = ? AND type = 'screenshot' ORDER BY seq DESC LIMIT 1").bind('hardfire',imageId).first();
    if(row){
      const key=JSON.parse(row.payload_json).key;
      if(typeof key!=='string'||!key.startsWith('screenshots/hardfire/')||!key.endsWith('-'+imageId+'.jpg'))throw new Error('Invalid screenshot key');
      const object=await env.SCREENSHOTS.get(key);
      if(object){if(object.size>16*1024*1024)throw new Error('Screenshot exceeds transport limit');return new Uint8Array(await object.arrayBuffer());}
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Screenshot upload is not ready; query the same command ID');
}
export async function materializeResult(env,result,id){
  if(!Array.isArray(result?.content))throw new Error('Invalid local MCP result');
  const content=[];
  for(const block of result.content){
    if(block.type==='image'&&block._hardfire_image_id){
      if(!validId(block._hardfire_image_id)||!block._hardfire_image_id.startsWith(id+':image:')||block.mimeType!=='image/jpeg')throw new Error('Invalid screenshot reference');
      const bytes=await imageForCommand(env,block._hardfire_image_id);let binary='';
      for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
      content.push({type:'image',mimeType:'image/jpeg',data:btoa(binary)});
    }else content.push(block);
  }
  return {...result,content};
}
export async function commandResult(env,id){
  const command=await readCommand(env,id);
  if(command.status==='done'){
    try{return await materializeResult(env,command.result,id);}catch{return {...text({status:'running',command_id:id,next_action:'Query hardfire_command_result with this ID; do not repeat the action.'})};}
  }
  if(command.status==='error')return {...text({status:'error',command_id:id,error:'Local command failed; effect may have occurred. Inspect state before retrying.'}),isError:true};
  return text({status:command.status||'unknown',command_id:id,next_action:'Query hardfire_command_result with this ID; do not repeat the action.'});
}
export async function runCommand(env,name,args){
  const {state}=await readState(env);
  if(!state?.connected||!Number.isFinite(state.last_seen)||Date.now()-state.last_seen>90000)throw new Error('HardFire agent not connected. Start the HardFire ChatGPT agent on your PC.');
  if(Array.isArray(state.meta?.state?.capabilities)&&!state.meta.state.capabilities.includes(name))throw new Error('Update the local HardFire agent to use this tool.');
  const id=crypto.randomUUID();let response;
  try{response=await controlRequest(env,'/api/rpc',{id,agent_id:'hardfire',action:name,args,wait_ms:25000,require_online:true});}
  catch{return {...text({status:'unknown',command_id:id,error:'Relay interrupted; action may have occurred. Query this ID without repeating the action.'}),isError:true};}
  if(response.status==='done')return materializeResult(env,response.result,id).catch(()=>text({status:'running',command_id:id,next_action:'Query hardfire_command_result with this ID.'}));
  return text({status:response.status||'unknown',command_id:id,next_action:'Query hardfire_command_result with this ID; do not repeat the action.'});
}
