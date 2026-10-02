'use strict';
const { startLocalMcp } = require('./local-mcp');

class LocalMcpManager {
  constructor(controller, options = {}, start = startLocalMcp) {
    this.controller = controller;
    this.options = options;
    this.start = start;
    this.handle = null;
    this.starting = null;
    this.stopped = false;
  }

  async ensureRunning() {
    if (this.stopped) throw new Error('Local MCP manager is stopped');
    if (this.handle?.state().listening) return this.handle;
    if (!this.starting) {
      this.starting = Promise.resolve().then(() => this.start(this.controller, this.options))
        .then(async (handle) => {
          if (this.stopped) {
            await handle.stop();
            throw new Error('Local MCP manager is stopped');
          }
          this.handle = handle;
          return handle;
        }).finally(() => { this.starting = null; });
    }
    return this.starting;
  }

  state() { return this.handle?.state() || { listening: false }; }

  async stop() {
    this.stopped = true;
    await this.starting?.catch(() => {});
    await this.handle?.stop();
  }
}

module.exports = { LocalMcpManager };
