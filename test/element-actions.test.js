'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {ElementActions}=require('../src/element-actions');
test('a stale reference cannot dispatch mouse or text input',async()=>{
  const calls=[];
  const actions=new ElementActions({send:async(...args)=>calls.push(args)},{resolve:async()=>{throw new Error('stale_ref');}});
  await assert.rejects(actions.click('old'),/stale_ref/);
  await assert.rejects(actions.fill('old','secret'),/stale_ref/);
  assert.deepEqual(calls,[]);
});
