'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {PageSnapshot}=require('../src/page-snapshot');
test('snapshot cursor rejects changes to document and filters before extracting',async()=>{
  const conn={generation:1,frameMap:new Map(),frames:async()=>[],send:async()=>{throw new Error('unexpected extraction');}};
  const page=new PageSnapshot(conn,{});
  page.cursors.set('old',{generation:0,query:'{}',offset:1,expires:Date.now()+60000});
  await assert.rejects(page.snapshot({cursor:'old'}),/stale_cursor/);
  page.cursors.set('wrong',{generation:1,query:'{}',offset:1,expires:Date.now()+60000});
  await assert.rejects(page.find({text:'other'},{cursor:'wrong'}),/stale_cursor/);
});
test('omitted frames are explicitly disclosed instead of claiming a complete empty page',async()=>{
  const frames=Array.from({length:34},(_,id)=>({id:String(id),supported:false,error:'unsupported_frame'}));
  const conn={generation:1,frameMap:new Map(),frames:async()=>frames,send:async()=>{throw new Error('unexpected');}};
  const result=await new PageSnapshot(conn,{}).snapshot();
  assert.equal(result.truncated,true);
  assert.equal(result.frames_omitted,2);
  assert.equal(result.extraction_limit,'frame_limit');
});
