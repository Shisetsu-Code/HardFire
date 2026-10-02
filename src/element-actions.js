'use strict';
const {press}=require('./keyboard-input');
class ElementActions{
  constructor(connection,references){this.connection=connection;this.references=references;}
  async verifyAncestors(target,x,y){
    let frame=this.connection.frameMap.get(target.frameId);const visited=new Set();
    while(frame?.parentId){
      if(visited.has(frame.id)||visited.size>=32)throw new Error('unsupported_frame: frame ancestry is unavailable');
      visited.add(frame.id);
      const parent=this.connection.frameMap.get(frame.parentId);
      if(!parent?.supported)throw new Error('unsupported_frame: parent session is unavailable');
      const owner=await this.connection.send('DOM.getFrameOwner',{frameId:frame.id},parent.sessionId);
      const {object}=await this.connection.send('DOM.resolveNode',{backendNodeId:owner.backendNodeId},parent.sessionId);
      try{
        const result=await this.connection.send('Runtime.callFunctionOn',{objectId:object.objectId,arguments:[{value:x},{value:y}],returnByValue:true,
          functionDeclaration:`function(x,y){const r=this.getBoundingClientRect(),s=getComputedStyle(this),m=new DOMMatrix(s.transform==='none'?undefined:s.transform);if(m.b||m.c)return {unsupported:true};const px=r.x+(this.clientLeft+x)*r.width/this.offsetWidth,py=r.y+(this.clientTop+y)*r.height/this.offsetHeight,h=this.ownerDocument.elementFromPoint(px,py);return {x:px,y:py,hit:h===this,visible:r.width>0&&r.height>0&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&!this.closest('[inert]')}}`},parent.sessionId);
        const state=result.result?.value;
        if(state?.unsupported)throw new Error('unsupported_frame: rotated frame geometry');
        if(!state?.hit||!state.visible)throw Object.assign(new Error('not_actionable: iframe is covered or hidden'),{code:'not_actionable'});
        x=state.x;y=state.y;frame=parent;
      }finally{await this.connection.send('Runtime.releaseObject',{objectId:object.objectId},parent.sessionId).catch(()=>{});}
    }
  }
  async prepare(ref,editable=false){
    const target=await this.references.resolve(ref);
    await this.connection.send('DOM.scrollIntoViewIfNeeded',{backendNodeId:target.backendNodeId},target.sessionId);
    const {object}=await this.connection.send('DOM.resolveNode',{backendNodeId:target.backendNodeId},target.sessionId);
    try{
      const checked=await this.connection.send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,
        functionDeclaration:`function(){const r=this.getBoundingClientRect(),s=getComputedStyle(this);const x=r.x+r.width/2,y=r.y+r.height/2,h=this.ownerDocument.elementFromPoint(x,y);return {connected:this.isConnected,visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0,disabled:!!this.disabled,editable:!this.readOnly&&(this.isContentEditable||this.tagName==='TEXTAREA'||(this.tagName==='INPUT'&&!['button','submit','radio','checkbox','file','hidden'].includes(this.type))),hit:!!h&&(h===this||this.contains(h)),x,y}}`},target.sessionId);
      const state=checked.result?.value;
      if(!state?.connected)throw new Error('stale_ref');
      if(!state.visible||state.disabled||!state.hit||(editable&&!state.editable))throw Object.assign(new Error('not_actionable: hidden, disabled, covered or not editable'),{code:'not_actionable'});
      await this.verifyAncestors(target,state.x,state.y);
      // Input is dispatched in the target widget; DOM quads account for nested frames.
      const {quads}=await this.connection.send('DOM.getContentQuads',{backendNodeId:target.backendNodeId},target.sessionId);
      const q=quads?.[0];if(!q?.length)throw new Error('not_actionable: empty geometry');
      return {...target,x:(q[0]+q[2]+q[4]+q[6])/4,y:(q[1]+q[3]+q[5]+q[7])/4};
    }finally{await this.connection.send('Runtime.releaseObject',{objectId:object.objectId},target.sessionId).catch(()=>{});}
  }
  async focus(ref){const target=await this.prepare(ref);await this.connection.send('DOM.focus',{backendNodeId:target.backendNodeId},target.sessionId);return target;}
  async click(ref){
    const target=await this.prepare(ref);
    try{await this.connection.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1},target.sessionId);}
    finally{await this.connection.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1},target.sessionId);}
    return {clicked:ref};
  }
  async fill(ref,value){
    if(typeof value!=='string'||value.length>65536)throw new Error('value must be a string of at most 65536 characters');
    const target=await this.prepare(ref,true);
    await this.connection.send('DOM.focus',{backendNodeId:target.backendNodeId},target.sessionId);
    await press(this.connection,{key:process.platform==='darwin'?'Meta+a':'Control+a',sessionId:target.sessionId});
    await this.connection.send('Input.insertText',{text:value},target.sessionId);
    await press(this.connection,{key:'Tab',sessionId:target.sessionId});
    return {filled:ref};
  }
}
module.exports={ElementActions};
