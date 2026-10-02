'use strict';
const connections=new WeakMap();
class PageConnection {
  static for(wc, options={}) {
    if(!connections.has(wc))connections.set(wc,new PageConnection(wc,options));
    const connection=connections.get(wc);
    if(options.sessionsProvider)connection.sessionsProvider=options.sessionsProvider;
    return connection;
  }
  constructor(wc,{sessionsProvider=()=>[]}={}) {
    this.wc=wc;this.debugger=wc.debugger;this.sessionsProvider=sessionsProvider;this.listeners=new Set();this.sessions=new Set();
    this.frameMap=new Map();this.generation=0;this.leases=0;this.closed=false;
    this.inflight=new Map();this.lastNetworkChange=Date.now();
    this.onMessage=(_event,method,params,sessionId)=>{
      const requestKey=(sessionId || 'root')+':'+params.requestId;
      if(method==='Network.requestWillBeSent' && params.type!=='WebSocket'){
        this.inflight.set(requestKey,{type:params.type,frameId:params.frameId});this.lastNetworkChange=Date.now();
        if(this.inflight.size>10000)this.inflight.delete(this.inflight.keys().next().value);
      }
      if(method==='Network.responseReceived' && sessionId && params.type==='Document'){
        for(const [key,request] of this.inflight){
          if(key.startsWith('root:') && request.type==='Document' && (key==='root:'+params.requestId || request.frameId===params.frameId)){
            this.inflight.delete(key);this.inflight.set(requestKey,request);
          }
        }
      }
      if(method==='Page.frameStoppedLoading'){
        for(const [key,request] of this.inflight)if(request.type==='Document' && request.frameId===params.frameId){this.inflight.delete(key);this.lastNetworkChange=Date.now();}
      }
      if(method==='Network.loadingFinished'||method==='Network.loadingFailed'||
        (method==='Network.responseReceived' && /event-stream|multipart\/x-mixed-replace/.test(params.response?.mimeType || ''))){
        if(this.inflight.delete(requestKey))this.lastNetworkChange=Date.now();
        if(sessionId){
          const rootKey='root:'+params.requestId;
          if(this.inflight.get(rootKey)?.type==='Document'){this.inflight.delete(rootKey);this.lastNetworkChange=Date.now();}
        }
      }
      if(method==='Page.frameNavigated' && !sessionId && !params.frame?.parentId){this.inflight.clear();this.lastNetworkChange=Date.now();}
      if(method==='Target.attachedToTarget' && params.targetInfo?.type==='iframe')this.sessions.add(params.sessionId);
      if(method==='Target.detachedFromTarget'){
        this.sessions.delete(params.sessionId);
        for(const [id,frame] of this.frameMap)if(frame.sessionId===params.sessionId)this.frameMap.delete(id);
      }
      if(method==='Page.frameNavigated' || method==='Page.frameDetached' || method==='DOM.documentUpdated' || method==='Target.detachedFromTarget')this.generation++;
      if(method==='Page.frameDetached')this.frameMap.delete(params.frameId);
      for(const listener of this.listeners)listener(method,params,sessionId);
    };
    this.onClose=()=>{
      this.closed=true;this.generation++;
      for(const listener of this.listeners)listener('HardFire.closed',{});
      this.listeners.clear();this.frameMap.clear();this.sessions.clear();
      this.inflight.clear();
      this.debugger.removeListener('message',this.onMessage);
      wc.removeListener?.('destroyed',this.onClose);
    };
    wc.debugger.on('message',this.onMessage);wc.once?.('destroyed',this.onClose);
  }
  acquire() {
    if(this.closed || this.wc.isDestroyed())throw new Error('tab_not_found: browser tab closed');
    if(!this.wc.debugger.isAttached())this.wc.debugger.attach();
    this.leases++;
    let released=false;
    // Runtime and HAR also use the debugger; lifetime belongs to the tab.
    return ()=>{if(!released){released=true;this.leases--;}};
  }
  async send(method,params={},sessionId) {
    const release=this.acquire();
    try{return await (sessionId ? this.wc.debugger.sendCommand(method,params,sessionId):this.wc.debugger.sendCommand(method,params));}
    finally{release();}
  }
  subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  startTracking(){
    if(!this.tracking)this.tracking=this.send('Network.enable').catch(error=>{this.trackingError=error;throw error;});
    return this.tracking;
  }
  async frames() {
    const frames=new Map();
    const sessions=[undefined,...new Set([...this.sessions,...this.sessionsProvider()])];
    for(const sessionId of sessions){
      try{
        await this.send('Page.enable',{},sessionId);
        await this.send('DOM.enable',{},sessionId);
        await this.send('Runtime.enable',{},sessionId);
        const {frameTree}=await this.send('Page.getFrameTree',{},sessionId);
        const walk=tree=>{
          if(!tree?.frame)return;
          const {id,url,parentId}=tree.frame;
          const old=frames.get(id);
          if(!old || sessionId)frames.set(id,{id,url,parentId,sessionId,supported:true});
          for(const child of tree.childFrames || [])walk(child);
        };walk(frameTree);
      }catch(error){frames.set(sessionId || 'root',{id:sessionId || 'root',sessionId,supported:false,error:'unsupported_frame'});}
    }
    this.frameMap=frames;return [...frames.values()];
  }
}
module.exports={PageConnection};
