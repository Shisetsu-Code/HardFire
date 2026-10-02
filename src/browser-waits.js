'use strict';
function validateWait({condition,timeout_ms=10000,idle_ms=500}={}){
  if(!Number.isInteger(timeout_ms)||timeout_ms<1||timeout_ms>60000)throw new Error('timeout_ms must be 1–60000');
  if(!Number.isInteger(idle_ms)||idle_ms<1||idle_ms>60000)throw new Error('idle_ms must be 1–60000');
  if(!condition||!['text','css','url','load','network_idle'].includes(condition.type))throw new Error('invalid wait condition');
  if(condition.type!=='network_idle'&&(typeof condition.value!=='string'||!condition.value||condition.value.length>2000))throw new Error('invalid wait condition value');
  if(condition.type==='load'&&!['interactive','complete'].includes(condition.value))throw new Error('invalid load state');
}
async function waitFor(connection,options={}){
  validateWait(options);
  const {condition,timeout_ms=10000,idle_ms=500,signal}=options;
  signal?.throwIfAborted();
  if(connection.closed)throw new Error('tab_not_found');
  const started=Date.now();let last=false;let timer;let poll;let finished=false;
  return new Promise((resolve,reject)=>{
    const end=(error,value)=>{
      if(finished)return;finished=true;clearTimeout(timer);clearTimeout(poll);unsubscribe();signal?.removeEventListener('abort',cancel);
      if(error)reject(error);else resolve(value);
    };
    const cancel=()=>end(signal.reason || new Error('cancelled'));
    const unsubscribe=connection.subscribe(method=>{
      if(method==='HardFire.closed')end(new Error('tab_not_found: tab closed'));
      else if(method==='Page.frameNavigated')end(new Error('cancelled: navigation changed the document'));
      else if(method==='Inspector.targetCrashed')end(new Error('backend_unavailable: page crashed'));
    });
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>end(Object.assign(new Error('timeout: condition not met'),{code:'timeout',observation:last})),timeout_ms);
    const check=async()=>{
      if(finished)return;
      try{
        if(condition.type==='network_idle'){
          if(connection.startTracking)await connection.startTracking();
          if(finished)return;
          last={pending:connection.inflight?.size || 0,idle_ms:Date.now()-Math.max(started,connection.lastNetworkChange || started)};
          if(!last.pending&&last.idle_ms>=idle_ms)return end(null,{matched:true,elapsed_ms:Date.now()-started,observation:last});
        }else{
          const value=JSON.stringify(condition.value);
          const expression=condition.type==='url'?`location.href.includes(${value})`:condition.type==='load'?`document.readyState===${value}||(${value}==='interactive'&&document.readyState==='complete')`:
            condition.type==='css'?`(()=>{let n=0;for(const e of document.querySelectorAll(${value})){if(n++>=10000)break;const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)!==0)return true;}return false})()`:
            `(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let e,n=0;while((e=w.nextNode())&&n++<10000){if(e.textContent.slice(0,4096).includes(${value})){const p=e.parentElement,r=p.getBoundingClientRect(),s=getComputedStyle(p);if(r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)!==0)return true;}}return false})()`;
          const result=await connection.send('Runtime.evaluate',{expression,returnByValue:true});
          if(result.exceptionDetails)throw new Error('invalid_condition: page evaluation failed');
          last=result.result?.value===true;
          if(last)return end(null,{matched:true,elapsed_ms:Date.now()-started,observation:true});
        }
        if(!finished)poll=setTimeout(check,50);
      }catch(error){end(error);}
    };
    void check();
  });
}
module.exports={waitFor,validateWait};
