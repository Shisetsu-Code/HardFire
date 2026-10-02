'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const http=require('node:http');const net=require('node:net');const assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
async function run(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hardfire-structured-'));
  const fixture=await fs.readFile(path.join(repo,'test/fixtures/structured-browser/index.html'),'utf8');
  let pendingSlow=0;
  const page=http.createServer((req,res)=>{
    if(req.url==='/delayed'){pendingSlow++;setTimeout(()=>{pendingSlow--;res.end('done');},1500);return;}
    if(req.url==='/slow'){res.setHeader('Content-Type','text/html');res.end('<script>fetch("/delayed")</script><p>Slow page</p>');return;}
    if(req.url==='/frames'){res.setHeader('Content-Type','text/html');res.end('<iframe srcdoc=""></iframe>'.repeat(33));return;}
    if(req.url==='/stream'){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: connected\n\n');return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(req.url==='/frame'?'<button aria-label="Frame action" onclick="this.setAttribute(\'aria-label\',\'Frame clicked\');this.textContent=\'Frame clicked\'">Frame button</button>':req.url==='/cross'?'<button aria-label="Cross action" onclick="this.setAttribute(\'aria-label\',\'Cross clicked\');this.textContent=\'Cross clicked\'">Cross button</button>':req.url==='/ping'?'pong':fixture.replace('CROSS_FRAME_URL',`http://localhost:${page.address().port}/cross`));
  });
  await new Promise(resolve=>page.listen(0,'127.0.0.1',resolve));
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  await fs.mkdir(path.join(root,'node_modules/electron'),{recursive:true});
  await fs.mkdir(path.join(root,'profile'));await fs.mkdir(path.join(root,'downloads'));
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'hardfire',main:'index.cjs'}));
  await fs.writeFile(path.join(root,'node_modules/electron/path.txt'),require('electron'));
  await fs.writeFile(path.join(root,'index.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(root,'profile'))});app.setPath('downloads',${JSON.stringify(path.join(root,'downloads'))});require('node:fs').writeFileSync(${JSON.stringify(path.join(root,'pid.txt'))},String(process.pid));require(${JSON.stringify(path.join(repo,'src/main.js'))});`);
  const [{Client},{StdioClientTransport}]=await Promise.all([import('@modelcontextprotocol/sdk/client/index.js'),import('@modelcontextprotocol/sdk/client/stdio.js')]);
  const client=new Client({name:'structured-check',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(repo,'plugin/HardFire/mcp/bridge.cjs')],env:{...process.env,HARDFIRE_MCP_URL:`http://127.0.0.1:${port}/mcp`,HARDFIRE_APP_PATH:root},stderr:'pipe'});
  const raw=(name,args={})=>client.callTool({name,arguments:args});
  const call=async(name,args={})=>{const result=await raw(name,args);assert.notEqual(result.isError,true,JSON.stringify(result));return result;};
  const state=async(name,args)=>JSON.parse((await call(name,args)).content[0].text);
  const find=async(name,tab_id)=>{const result=await state('hardfire_find',{name,role:['Nombre','Notas','Editor'].includes(name)?'textbox':'button',tab_id});assert.equal(result.elements.length,1,JSON.stringify(result));return result.elements[0].ref;};
  try{
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length,25);
    const initial=await state('hardfire_launch',{headless:true});assert.equal(initial.visible,false);
    const url=`http://127.0.0.1:${page.address().port}/`;
    await call('hardfire_record_start',{tab_id:initial.tab_id});
    assert.equal((await raw('hardfire_tab_close',{tab_id:initial.tab_id})).isError,true,'recording tab must require HAR save');
    await call('hardfire_open',{url,tab_id:initial.tab_id});
    const snapshot=await state('hardfire_snapshot',{tab_id:initial.tab_id});
    assert.ok(snapshot.elements.some(e=>e.name==='Nombre'),JSON.stringify(snapshot));
    assert.equal(snapshot.canvas,true);assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<=12288);
    assert.ok(!JSON.stringify(snapshot).includes('DO_NOT_RETURN_THIS'));
    const input=await find('Nombre',initial.tab_id);
    await call('hardfire_fill_ref',{ref:input,value:'Español 😀',tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Changed:'},tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Value observed: Español 😀'},tab_id:initial.tab_id});
    await call('hardfire_fill_ref',{ref:input,value:'',tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Value empty'},timeout_ms:1000,tab_id:initial.tab_id});
    await call('hardfire_fill_ref',{ref:await find('Notas',initial.tab_id),value:'Nota 😀',tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Textarea observed: Nota 😀'},tab_id:initial.tab_id});
    await call('hardfire_fill_ref',{ref:await find('Editor',initial.tab_id),value:'Editor 😀',tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Editor observed: Editor 😀'},tab_id:initial.tab_id});
    const partial=await state('hardfire_find',{css:'.many',limit:100,max_bytes:65536,tab_id:initial.tab_id});
    assert.equal(partial.elements.length,100);assert.ok(partial.next_cursor);
    const next=await state('hardfire_find',{css:'.many',limit:100,max_bytes:65536,cursor:partial.next_cursor,tab_id:initial.tab_id});
    assert.equal(next.elements.length,100);assert.equal(next.elements[0].name,'Many 100 😀');
    const last=await state('hardfire_find',{css:'.many',limit:100,max_bytes:65536,cursor:next.next_cursor,tab_id:initial.tab_id});
    assert.equal(last.elements.length,30);assert.equal(last.next_cursor,null);
    const frameButton=await find('Frame action',initial.tab_id);await call('hardfire_click_ref',{ref:frameButton,tab_id:initial.tab_id});
    await find('Frame clicked',initial.tab_id);
    const crossButton=await find('Cross action',initial.tab_id);await call('hardfire_click_ref',{ref:crossButton,tab_id:initial.tab_id});
    await find('Cross clicked',initial.tab_id);
    await find('Save order',initial.tab_id);
    const coveredFrameRef=await find('Frame clicked',initial.tab_id);
    await call('hardfire_click_ref',{ref:await find('Cover frame',initial.tab_id),tab_id:initial.tab_id});
    assert.equal((await raw('hardfire_click_ref',{ref:coveredFrameRef,tab_id:initial.tab_id})).isError,true,'parent overlay must block iframe input');
    const covered=await find('Cubierto',initial.tab_id);
    assert.equal((await raw('hardfire_click_ref',{ref:covered,tab_id:initial.tab_id})).isError,true);
    const disabled=await find('Deshabilitado',initial.tab_id);
    assert.equal((await raw('hardfire_click_ref',{ref:disabled,tab_id:initial.tab_id})).isError,true);
    assert.equal((await state('hardfire_find',{name:'Oculto',role:'button',tab_id:initial.tab_id})).elements.length,0);
    await call('hardfire_press',{key:'Control+L',tab_id:initial.tab_id});
    assert.equal((await state('hardfire_status')).url,url);
    const slow=await state('hardfire_tab_new',{url:url+'slow',activate:false});
    await call('hardfire_wait',{ms:250,tab_id:initial.tab_id});
    assert.equal(pendingSlow,1,'slow request should be pending before first structured call');
    await call('hardfire_wait_for',{condition:{type:'network_idle'},timeout_ms:4000,tab_id:slow.id});
    assert.equal(pendingSlow,0,'network idle cannot ignore a request started before first structured call');
    const frameTab=await state('hardfire_tab_new',{url:url+'frames',activate:false});
    const limitedFrames=await state('hardfire_snapshot',{tab_id:frameTab.id});
    assert.equal(limitedFrames.truncated,true);assert.ok(limitedFrames.frames_omitted>=2);assert.equal(limitedFrames.extraction_limit,'frame_limit');
    const inspect=await state('hardfire_inspect_ref',{ref:input,tab_id:initial.tab_id});
    assert.ok(inspect.elements[0].children.length<=20);
    assert.ok(Buffer.byteLength(JSON.stringify(inspect))<=12288);
    const replace=await find('Reemplazar',initial.tab_id);
    await call('hardfire_click_ref',{ref:replace,tab_id:initial.tab_id});
    assert.equal((await raw('hardfire_click_ref',{ref:replace,tab_id:initial.tab_id})).isError,true);
    await call('hardfire_click_ref',{ref:await find('Confirmar',initial.tab_id),tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'text',value:'Clicked successfully'},tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'css',value:'#late'},tab_id:initial.tab_id});
    await call('hardfire_wait_for',{condition:{type:'network_idle'},timeout_ms:3000,tab_id:initial.tab_id});
    const second=await state('hardfire_tab_new',{url,activate:false});
    assert.equal((await state('hardfire_status')).tab_id,initial.tab_id);
    const waiting=state('hardfire_sequence',{tab_id:second.id,steps:[{action:'wait',args:{ms:100}},{action:'open',args:{url:url+'?second'}}]});
    await call('hardfire_tab_activate',{tab_id:initial.tab_id});await waiting;
    assert.equal((await state('hardfire_status')).url,url);
    const recording=await state('hardfire_record_save',{tab_id:initial.tab_id});assert.ok(recording.entries>0);
    const image=(await call('hardfire_screenshot',{tab_id:initial.tab_id})).content.find(c=>c.type==='image');
    assert.ok(Buffer.from(image.data,'base64').length>1000);
    await fs.writeFile(path.join(root,'snapshot.jpg'),Buffer.from(image.data,'base64'));
    for(const tab of [frameTab.id,slow.id,second.id,initial.tab_id])await call('hardfire_tab_close',{tab_id:tab});
    assert.equal((await state('hardfire_tabs')).tabs.filter(tab=>tab.type==='game').length,0);
    console.log(JSON.stringify({passed:true,tools:25,tabs:4,hidden:true,refs:true,inputEvents:true,waits:true,HAR:recording.path,artifacts:root}));
  }finally{
    await client.close();try{process.kill(Number(await fs.readFile(path.join(root,'pid.txt'),'utf8')));}catch{}
    page.closeAllConnections();await new Promise(r=>page.close(r));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

