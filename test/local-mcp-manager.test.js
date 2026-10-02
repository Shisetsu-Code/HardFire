'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalMcpManager } = require('../src/local-mcp-manager');
const { startLocalMcp } = require('../src/local-mcp');

test('concurrent recovery reuses the controller and healthy server', async (t) => {
  const controller = { status: async () => ({ tab_id: 41 }) };
  let starts = 0;
  const manager = new LocalMcpManager(controller, { port: 0 }, async (...args) => {
    starts++;
    return startLocalMcp(...args);
  });
  t.after(() => manager.stop());
  const [a,b] = await Promise.all([manager.ensureRunning(), manager.ensureRunning()]);
  assert.equal(a, b);
  assert.equal(await manager.ensureRunning(), a);
  assert.equal(starts, 1);
  await a.stop();
  const [c,d] = await Promise.all([manager.ensureRunning(), manager.ensureRunning()]);
  assert.equal(c, d);
  assert.notEqual(c, a);
  assert.equal(starts, 2);
  assert.equal(c.state().listening, true);
  assert.deepEqual(await controller.status(), { tab_id: 41 });
});

test('a failed start can be retried and stopping prevents accidental recovery', async () => {
  let starts = 0;
  const manager = new LocalMcpManager({}, {}, async () => {
    if (++starts === 1) throw new Error('occupied');
    return { state: () => ({ listening: true }), stop: async () => {} };
  });
  await assert.rejects(manager.ensureRunning(), /occupied/);
  await manager.ensureRunning();
  await manager.stop();
  await assert.rejects(manager.ensureRunning(), /stopped/);
});
