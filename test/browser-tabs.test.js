'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BrowserTabs } = require('../src/browser-tabs');
const { HardFireController } = require('../src/hardfire-controller');

function fixture() {
  let active = 1;
  const effects = [];
  const tabs = new Map([1,2,3].map(id => [id, {id,kind:id === 3 ? 'mcp':'game',
    view:{getBounds:()=>({width:100,height:80}),webContents:{isDestroyed:()=>!tabs.has(id),
      getURL:()=>`https://tab${id}.test/`,getTitle:()=>`Tab ${id}`,isLoading:()=>false,
      loadURL:async url=>effects.push([id,url])}}}]));
  const options = {listTabs:()=>[...tabs.values()],getActiveTab:()=>tabs.get(active),
    activateTab:id=>{active=id;},closeTab:async(id,options)=>{effects.push(['close',id,options]);tabs.delete(id);},
    createTab:(url,options)=>{ const id=4; const tab={...tabs.get(1),id,url};tabs.set(id,tab);if(options.activate)active=id;return tab;}};
  return {tabs,effects,options,manager:new BrowserTabs(options),select:id=>{active=id;},active:()=>active};
}

test('tab IDs are strict and internal or recording tabs cannot be closed', async () => {
  const f = fixture();
  assert.equal(f.manager.list()[2].type, 'mcp');
  for (const id of [0,-1,'2',99]) assert.throws(()=>f.manager.resolve(id), /tab_not_found/);
  assert.throws(()=>f.manager.activate(3), /tab_not_found/);
  await assert.rejects(f.manager.close(3), /tab_not_found/);
  f.tabs.get(2).recorder={recording:true};
  await assert.rejects(f.manager.close(2), /save.*HAR/i);
  assert.deepEqual(f.effects, []);
  f.tabs.get(2).recorder.recording=false;
  assert.deepEqual(await f.manager.close(2), {closed:2});
  assert.deepEqual(f.effects, [['close',2,{createReplacement:false}]]);
  assert.throws(()=>f.manager.resolve(2), /tab_not_found/);
});

test('a scoped controller keeps its target across selection changes', async () => {
  const f = fixture();
  const controller = new HardFireController(f.options);
  const scoped = controller.withTab(2);
  await scoped.open('https://destination.test/');
  assert.equal(f.active(), 1);
  f.select(1);
  const pending=scoped.sequence([{action:'wait',args:{ms:20}}, {action:'open',args:{url:'https://second.test/'}}]);
  f.select(3);
  await pending;
  assert.deepEqual(f.effects, [[2,'https://destination.test/'],[2,'https://second.test/']]);
  assert.throws(()=>controller.withTab(99), /tab_not_found/);
});

test('sequence validates every explicit destination before navigating', async () => {
  const f = fixture();
  const controller = new HardFireController(f.options);
  await assert.rejects(controller.sequence([{action:'open',args:{url:'https://destination.test/'}},
    {action:'open',args:{url:'https://second.test/',tab_id:99}}]), /tab_not_found/);
  assert.deepEqual(f.effects, []);
});
