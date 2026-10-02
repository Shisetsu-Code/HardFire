'use strict';

const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('hardFireMcp', {
  state: () => ipcRenderer.invoke('mcp:get-state'),
  copy: (value) => clipboard.writeText(String(value || ''))
});
