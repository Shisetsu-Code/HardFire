'use strict';

const el = (id) => document.getElementById(id);

async function refresh() {
  const state = await window.hardFireMcp.state();
  const local = state?.local || {};
  const remote = state?.remote || {};

  el('endpoint').textContent = local.endpoint || 'http://127.0.0.1:8765/mcp';
  el('localStatus').textContent = local.listening ? 'LISTENING' : (local.error || 'OFFLINE');
  el('remoteStatus').textContent = remote.connected ? 'CONNECTED' : (remote.enabled ? 'DISCONNECTED' : 'NOT CONFIGURED');
  el('agent').textContent = remote.agentId || 'firetrace';
  el('remoteUrl').textContent = remote.baseUrl || '—';

  const config = {
    mcpServers: {
      hardfire: {
        type: 'streamable-http',
        url: local.endpoint || 'http://127.0.0.1:8765/mcp'
      }
    }
  };
  el('config').textContent = JSON.stringify(config, null, 2);
}

el('copyUrl').addEventListener('click', () => {
  window.hardFireMcp.copy(el('endpoint').textContent);
});

el('copyConfig').addEventListener('click', () => {
  window.hardFireMcp.copy(el('config').textContent);
});

refresh();
setInterval(refresh, 1500);
