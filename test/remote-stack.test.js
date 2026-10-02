'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire keeps remote-agent support available for dedicated future transport', () => {
  const remoteAgent = fs.readFileSync(path.join(root, 'src', 'remote-agent.js'), 'utf8');
  const cloudflareMcp = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'mcp.js'), 'utf8');

  assert.match(remoteAgent, /HARDFIRE_CONTROL_URL/);
  assert.match(cloudflareMcp, /hardfire_status/);
  assert.match(cloudflareMcp, /hardfire_record_start/);
});

test('remote agent builds the HardFire WSS endpoint with its own agent id', () => {
  const { wsUrl } = require('../src/remote-agent');
  assert.equal(
    wsUrl('https://control.example', 'hardfire'),
    'wss://control.example/ws?agent_id=hardfire'
  );
});


test('controller accepts namespaced HardFire actions from the remote MCP', async () => {
  const { HardFireController } = require('../src/hardfire-controller');
  const controller = new HardFireController({});
  controller.networkEvents = () => ({ events: ['ok'] });
  controller.networkClear = () => ({ cleared: true });
  controller.recordStart = async () => ({ recording: true });
  controller.recordSave = async () => ({ saved: true });
  controller.sequence = async (steps) => ({ steps });

  assert.deepEqual(await controller.execute('hardfire_network_events'), { events: ['ok'] });
  assert.deepEqual(await controller.execute('hardfire_network_clear'), { cleared: true });
  assert.deepEqual(await controller.execute('hardfire_record_start'), { recording: true });
  assert.deepEqual(await controller.execute('hardfire_record_save'), { saved: true });
  assert.deepEqual(
    await controller.execute('hardfire_sequence', { steps: [{ action: 'status' }] }),
    { steps: [{ action: 'status' }] }
  );
});
