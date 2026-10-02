'use strict';
const {randomUUID}=require('node:crypto');
function stale(){return Object.assign(new Error('stale_ref: request another snapshot or search'),{code:'stale_ref'});}
class ElementReferences {
  constructor(connection,tabId){
    this.connection=connection;this.tabId=tabId;this.entries=new Map();
    connection.subscribe(method=>{
      if(['Page.frameNavigated','Page.frameDetached','DOM.documentUpdated','Target.detachedFromTarget','HardFire.closed'].includes(method))this.invalidate();
    });
  }
  add(frameId,backendNodeId){
    const frame=this.connection.frameMap.get(frameId);
    if(!frame?.supported)throw Object.assign(new Error('unsupported_frame'),{code:'unsupported_frame'});
    const ref=randomUUID();
    this.entries.set(ref,{tabId:this.tabId,frameId,sessionId:frame.sessionId,backendNodeId,generation:this.connection.generation});
    if(this.entries.size>2000)this.entries.delete(this.entries.keys().next().value);
    return ref;
  }
  invalidate(frameId){for(const [ref,target] of this.entries)if(!frameId || target.frameId===frameId)this.entries.delete(ref);}
  async resolve(ref){
    const target=this.entries.get(ref);
    if(!target || target.generation!==this.connection.generation || this.connection.closed)throw stale();
    let objectId;
    try{
      const {object}=await this.connection.send('DOM.resolveNode',{backendNodeId:target.backendNodeId},target.sessionId);
      objectId=object?.objectId;
      if(!objectId)throw stale();
      const response=await this.connection.send('Runtime.callFunctionOn',{objectId,functionDeclaration:'function(){return this.isConnected}',returnByValue:true},target.sessionId);
      if(response.exceptionDetails || response.result?.value!==true)throw stale();
      return {...target};
    }catch{this.entries.delete(ref);throw stale();}
    finally{if(objectId)await this.connection.send('Runtime.releaseObject',{objectId},target.sessionId).catch(()=>{});}
  }
}
module.exports={ElementReferences};
