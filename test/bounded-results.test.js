'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {boundedResults}=require('../src/bounded-results');
test('UTF-8 budget includes metadata, cursor and multi-byte element text',()=>{
  const items=Array.from({length:200},(_,id)=>({ref:String(id),name:'😀'.repeat(128)}));
  const result=boundedResults(items,{limit:200,max_bytes:1024,metadata:{frames:[{id:'root'}]},nextCursor:'cursor'});
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=1024);
  assert.equal(result.truncated,true);assert.equal(result.next_cursor,'cursor');
  assert.ok(result.elements.length>0);assert.ok(result.elements.length<200);
  for(const options of [{limit:201},{max_bytes:65537},{limit:0}])assert.throws(()=>boundedResults(items,options));
});
test('an oversized single element cannot create a cursor that makes no progress',()=>{
  assert.throws(()=>boundedResults([{name:'x'.repeat(5000)}],{max_bytes:512,nextCursor:'again'}),/max_bytes/);
});
