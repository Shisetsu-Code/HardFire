'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {press,parseKey}=require('../src/keyboard-input');
test('invalid combinations send no input and a failed key press releases modifiers',async()=>{
  const calls=[];
  const connection={send:async(method,args)=>{calls.push([method,args]);if(args.type==='keyDown'&&args.key==='a')throw new Error('failed');}};
  for(const key of ['Control+Unknown','Control+Control+A','',null])await assert.rejects(press(connection,{key}));
  assert.deepEqual(calls,[]);
  await assert.rejects(press(connection,{key:'Control+a'}),/failed/);
  assert.equal(calls.at(-1)[1].type,'keyUp');assert.equal(calls.at(-1)[1].key,'Control');
  assert.equal(parseKey('Control+L').key,'L');
});
