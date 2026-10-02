'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function createLauncher(endpoint) {
  const url = new URL(endpoint);
  const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const enabled = local && process.env.HARDFIRE_AUTO_START !== '0' &&
    (!process.env.HARDFIRE_MCP_URL || Boolean(process.env.HARDFIRE_APP_PATH));
  let starting;
  async function ready() {
    try {
      const res = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(1000) });
      return res.ok && (await res.json()).service === 'hardfire-local-mcp';
    } catch { return false; }
  }
  function command(headless) {
    const modeArgs = [headless ? '--hardfire-hidden' : '--hardfire-visible'];
    const candidates = process.env.HARDFIRE_APP_PATH ? [process.env.HARDFIRE_APP_PATH] : [
      path.resolve(__dirname, '../../..'),
      ...(process.platform === 'win32' ? ['C:\\HardFire', path.join(process.env.LOCALAPPDATA || '', 'Programs/HardFire/HardFire.exe')] : [])
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      if (fs.statSync(candidate).isFile()) return { executable: candidate, args: modeArgs, cwd: path.dirname(candidate) };
      const manifest = path.join(candidate, 'package.json');
      if (!fs.existsSync(manifest) || JSON.parse(fs.readFileSync(manifest, 'utf8')).name !== 'hardfire') continue;
      const electronRoot = path.join(candidate, 'node_modules/electron');
      const executable = path.resolve(electronRoot, 'dist', fs.readFileSync(path.join(electronRoot, 'path.txt'), 'utf8').trim());
      return { executable, args: [candidate, ...modeArgs], cwd: candidate };
    }
    throw new Error('HardFire installation not found. Set HARDFIRE_APP_PATH to its folder or executable.');
  }
  async function start(headless) {
    if (await ready()) return;
    const { executable, args, cwd } = command(headless);
    const env = { ...process.env, HARDFIRE_MCP_PORT: url.port || '80', HARDFIRE_HEADLESS: headless ? '1' : '0' };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, args, { cwd, env, windowsHide:true, detached:true, stdio:'ignore' });
    let failed;
    child.on('error', (error) => { failed = error; });
    child.on('exit', (code) => { if (code !== 0) failed = new Error('HardFire exited before becoming ready (code ' + code + ')'); });
    child.unref();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await ready()) return;
      if (failed) throw failed;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('HardFire did not become ready within 30 seconds.');
  }
  return async function ensureBrowser({headless = process.env.HARDFIRE_HEADLESS !== '0'} = {}) {
    if (typeof headless !== 'boolean') throw new Error('headless must be boolean');
    if (!enabled) return;
    if (!starting) starting = start(headless).finally(() => { starting = null; });
    await starting;
  };
}

module.exports = { createLauncher };
