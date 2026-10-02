'use strict';
const {randomUUID}=require('node:crypto');
const {boundedResults}=require('./bounded-results');

function describeElement(){
  const e=this,s=getComputedStyle(e),r=e.getBoundingClientRect();
  const clip=value=>String(value||'').slice(0,256);
  const attrs={};for(let i=0;i<Math.min(20,e.attributes.length);i++){const a=e.attributes[i];if(a.name!=='value' && !a.name.startsWith('on'))attrs[a.name]=clip(a.value);}
  const shortText=node=>{let out='',count=0;const w=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(out.length<256&&count++<64&&(text=w.nextNode()))if(!text.parentElement?.closest('script,style,noscript'))out+=text.data.slice(0,256-out.length);return out;};
  const labelText=[];for(let i=0;i<Math.min(10,e.labels?.length||0);i++)labelText.push(shortText(e.labels[i]));
  let role=e.getAttribute('role') || ({BUTTON:'button',A:'link',TEXTAREA:'textbox',SELECT:'combobox',IMG:'img',CANVAS:'canvas',H1:'heading',H2:'heading',H3:'heading',LABEL:'LabelText'}[e.tagName]) || (e.tagName==='INPUT' ? ({checkbox:'checkbox',radio:'radio',button:'button',submit:'button'}[e.type] || 'textbox'):'text');
  const labelled=e.getAttribute('aria-labelledby');
  const text=shortText(e);
  const name=clip(e.getAttribute('aria-label') || (labelled ? labelled.slice(0,256).split(/\s+/).slice(0,10).map(id=>{const label=document.getElementById(id);return label?shortText(label):''}).join(' '):'') || labelText.join(' ') || e.getAttribute('alt') || e.getAttribute('title') || e.getAttribute('placeholder') || text);
  return {tag:e.tagName.toLowerCase(),role,name,text:e.tagName==='INPUT'?'':text,attributes:attrs,
    visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0,
    disabled:Boolean(e.disabled),editable:!e.disabled&&!e.readOnly&&(e.isContentEditable||e.tagName==='TEXTAREA'||(e.tagName==='INPUT'&&!['button','submit','checkbox','radio','file','hidden'].includes(e.type))),
    rect:{x:r.x,y:r.y,width:r.width,height:r.height},truncated:text.length>=256||e.attributes.length>20};
}

class PageSnapshot{
  constructor(connection,references){this.connection=connection;this.references=references;this.cursors=new Map();}
  snapshot(options={}){return this.find({},options);}
  async describe(objectId,sessionId){
    const result=await this.connection.send('Runtime.callFunctionOn',{objectId,functionDeclaration:describeElement.toString(),returnByValue:true},sessionId);
    if(result.exceptionDetails)throw new Error('stale_ref');return result.result.value;
  }
  async find(filters={},options={}){
    const query=JSON.stringify(Object.fromEntries(Object.entries(filters).sort()));
    let offset=0;
    if(options.cursor){
      const saved=this.cursors.get(options.cursor);
      if(!saved||saved.generation!==this.connection.generation||saved.query!==query||saved.expires<Date.now())throw new Error('stale_cursor: request a new snapshot');
      offset=saved.offset;
    }
    const allFrames=await this.connection.frames();
    const frames=allFrames.slice(0,32).map(frame=>({...frame,url:String(frame.url||'').slice(0,256)}));
    const frameBudget=(options.max_bytes || 12288)/2;
    while(frames.length>1 && Buffer.byteLength(JSON.stringify(frames))>frameBudget)frames.pop();
    const framesOmitted=allFrames.length-frames.length;
    let remainingOffset=offset;
    const elements=[];let seen=0;let scanLimit=framesOmitted>0;let canvas=false;
    for(const frame of frames){
      if(!frame.supported)continue;
      const sessionId=frame.sessionId;
      const group='hardfire-snapshot-'+randomUUID();
      try{
        const {executionContextId}=await this.connection.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'hardfire-automation'},sessionId);
        const expression=`({walker:document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT),current:document.documentElement,scanned:0,canvas:!!document.querySelector('canvas')})`;
        const evaluated=await this.connection.send('Runtime.evaluate',{expression,contextId:executionContextId,objectGroup:group},sessionId);
        if(evaluated.exceptionDetails)throw new Error('invalid_filter: '+evaluated.exceptionDetails.text);
        let more=true;
        while(more && seen<10000 && elements.length<201){
          const chunkGroup=group+'-chunk';
          try{
            const chunk=await this.connection.send('Runtime.callFunctionOn',{objectId:evaluated.result.objectId,objectGroup:chunkGroup,
              functionDeclaration:`function(){const describe=${describeElement.toString()},filters=${JSON.stringify(filters)},nodes=[];let n=0;while(this.current&&n<${Math.max(0,10000-seen)}){const e=this.current;this.current=this.walker.nextNode();n++;if(!e.matches('script,style,noscript')&&(e.matches('input,button,textarea,select,a,[role],[contenteditable],canvas,h1,h2,h3,p,label')||${Boolean(filters.css||filters.text)})&&(!filters.css||e.matches(filters.css))){const item=describe.call(e);if((filters.visible===false||item.visible)&&(!filters.text||item.text.includes(filters.text))&&(!filters.placeholder||String(item.attributes.placeholder||'').includes(filters.placeholder)))nodes.push(e);if(nodes.length>=201)break;}}return {nodes,scanned:n,truncated:!!this.current,canvas:this.canvas}}`},sessionId);
            if(chunk.exceptionDetails)throw new Error('invalid_filter: '+chunk.exceptionDetails.text);
            const info=await this.connection.send('Runtime.getProperties',{objectId:chunk.result.objectId,ownProperties:true},sessionId);
            const field=name=>info.result.find(p=>p.name===name)?.value;
            seen+=field('scanned')?.value || 0;more=Boolean(field('truncated')?.value);canvas ||= Boolean(field('canvas')?.value);
            const nodes=await this.connection.send('Runtime.getProperties',{objectId:field('nodes').objectId,ownProperties:true},sessionId);
            for(const property of nodes.result){
              if(!/^\d+$/.test(property.name)||!property.value?.objectId)continue;
              const objectId=property.value.objectId;
              const item=await this.describe(objectId,sessionId);
              const {node}=await this.connection.send('DOM.describeNode',{objectId},sessionId);
              try{
                const ax=await this.connection.send('Accessibility.getPartialAXTree',{backendNodeId:node.backendNodeId,fetchRelatives:false},sessionId);
                const accessible=ax.nodes?.find(n=>n.backendDOMNodeId===node.backendNodeId&&!n.ignored);
                if(accessible?.name?.value)item.name=String(accessible.name.value).slice(0,256);
                if(accessible?.role?.value)item.role=accessible.role.value;
              }catch{}
              if(filters.role && item.role!==filters.role)continue;
              if(filters.name && !item.name.includes(filters.name))continue;
              if(remainingOffset>0){remainingOffset--;continue;}
              elements.push({...item,ref:this.references.add(frame.id,node.backendNodeId),frame_id:frame.id});
              if(elements.length>=201){more=true;break;}
            }
          }finally{await this.connection.send('Runtime.releaseObjectGroup',{objectGroup:chunkGroup},sessionId).catch(()=>{});}
        }
        scanLimit ||= more;
      }catch(error){
        if(error.message.startsWith('invalid_filter'))throw error;
        frame.supported=false;frame.error='unsupported_frame';
      }finally{await this.connection.send('Runtime.releaseObjectGroup',{objectGroup:group},sessionId).catch(()=>{});}
      if(seen>=10000||elements.length>=201)break;
    }
    const cursor=randomUUID();
    const result=boundedResults(elements,{...options,nextCursor:elements.length?cursor:null,metadata:{url:String(this.connection.wc?.getURL?.()||'').slice(0,256),title:String(this.connection.wc?.getTitle?.()||'').slice(0,256),frames,frames_omitted:framesOmitted,extraction_limit:framesOmitted?'frame_limit':seen>=10000?'node_limit':undefined,canvas,note:canvas?'Canvas controls may require screenshot and coordinates':undefined,truncated:scanLimit}});
    if(result.next_cursor){
      this.cursors.set(cursor,{generation:this.connection.generation,query,offset:offset+result.elements.length,expires:Date.now()+60000});
      while(this.cursors.size>8)this.cursors.delete(this.cursors.keys().next().value);
    }
    return result;
  }
  async inspect(ref,options={}){
    const target=await this.references.resolve(ref);const group='hardfire-inspect-'+randomUUID();
    try{
      const {object}=await this.connection.send('DOM.resolveNode',{backendNodeId:target.backendNodeId,objectGroup:group},target.sessionId);
      const element=await this.describe(object.objectId,target.sessionId);
      const related=await this.connection.send('Runtime.callFunctionOn',{objectId:object.objectId,
        functionDeclaration:`function(){const describe=${describeElement.toString()},children=[];for(let i=0;i<Math.min(20,this.children.length);i++)children.push(describe.call(this.children[i]));return {parent:this.parentElement?describe.call(this.parentElement):null,children,children_truncated:this.children.length>20}}`,returnByValue:true},target.sessionId);
      const item={...element,ref,...related.result.value};
      while(item.children.length && Buffer.byteLength(JSON.stringify({elements:[item],truncated:false,next_cursor:null}))>(options.max_bytes || 12288)){item.children.pop();item.children_truncated=true;}
      return boundedResults([item],{...options,limit:1});
    }finally{await this.connection.send('Runtime.releaseObjectGroup',{objectGroup:group},target.sessionId).catch(()=>{});}
  }
}
module.exports={PageSnapshot,describeElement};
